"""Modelos por componente y evaluación por participante.

Regla central: ningún participante aparece a la vez en el conjunto de ajuste y en el de evaluación. Con una fila por
participante, partir por filas equivale a partir por participante, pero el código trabaja con grupos para que siga siendo
correcto si algún día hubiera mediciones repetidas.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.base import RegressorMixin, clone
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from xgboost import XGBRegressor

from .config import (BASELINE_FEATURES, BASELINE_MODEL, COMPONENTS, FEATURE_SETS, RANDOM_FOREST_PARAMS, XGBOOST_PARAMS,
                     Component, EvaluationSettings)


# ----------------------------------------------------------------------------- modelos
def make_model(name: str, seed: int) -> RegressorMixin:
    if name == "lineal":
        return LinearRegression()
    if name == "random_forest":
        return RandomForestRegressor(random_state=seed, **RANDOM_FOREST_PARAMS)
    if name == "xgboost":
        return XGBRegressor(random_state=seed, **XGBOOST_PARAMS)
    if name == "media":  # referencia: predice siempre la media del ajuste
        return MeanRegressor()
    raise ValueError(f"Modelo desconocido: {name}")


class MeanRegressor(RegressorMixin):
    """Referencia trivial: la media del conjunto de ajuste. Un modelo que no la supere no aporta nada."""

    def fit(self, X, y):
        self.mean_ = float(np.mean(y))
        return self

    def predict(self, X):
        return np.full(len(X), self.mean_)

    def get_params(self, deep=True):
        return {}

    def set_params(self, **params):
        return self


MODEL_NAMES = ["lineal", "random_forest", "xgboost"]


# ----------------------------------------------------------------------------- particiones
def participant_folds(groups: np.ndarray, k: int, seed: int):
    """Genera (índices de ajuste, índices de prueba) con grupos disjuntos entre ajuste y prueba."""
    groups = np.asarray(groups)
    unique = np.unique(groups)
    if k > len(unique):
        raise ValueError(f"Hay {len(unique)} participantes y se pidieron {k} pliegues.")
    rng = np.random.default_rng(seed)
    order = rng.permutation(unique)
    chunks = np.array_split(order, k)
    for chunk in chunks:
        test_mask = np.isin(groups, chunk)
        yield np.where(~test_mask)[0], np.where(test_mask)[0]


def holdout_split(ids: list[str], fraction: float, seed: int) -> tuple[list[str], list[str]]:
    """Separa participantes completos en desarrollo y prueba final."""
    if not 0 < fraction < 1:
        raise ValueError("La fracción de prueba debe estar entre 0 y 1.")
    rng = np.random.default_rng(seed)
    ids = list(ids)
    order = rng.permutation(len(ids))
    n_test = max(1, int(round(fraction * len(ids))))
    test = [ids[i] for i in order[:n_test]]
    dev = [ids[i] for i in order[n_test:]]
    return dev, test


# ----------------------------------------------------------------------------- métricas
def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    err = y_pred - y_true
    ss_res = float(np.sum(err ** 2))
    ss_tot = float(np.sum((y_true - y_true.mean()) ** 2))
    out = {
        "n": int(len(y_true)),
        "mae": float(np.mean(np.abs(err))),
        "rmse": float(np.sqrt(np.mean(err ** 2))),
        "r2": float(1 - ss_res / ss_tot) if ss_tot > 0 else float("nan"),
        "sesgo": float(np.mean(err)),
    }
    if len(y_true) >= 3 and np.std(y_pred) > 0:
        slope, intercept = np.polyfit(y_pred, y_true, 1)  # calibración: observado = a + b * estimado
        out["calibracion_pendiente"] = float(slope)
        out["calibracion_intercepto"] = float(intercept)
    else:
        out["calibracion_pendiente"] = float("nan")
        out["calibracion_intercepto"] = float("nan")
    return out


# ----------------------------------------------------------------------------- validación cruzada
@dataclass
class CVResult:
    component: str
    features: str
    model: str
    mean: dict[str, float]
    sd: dict[str, float]
    oof_pred: np.ndarray       # predicciones fuera de muestra de la primera repetición
    oof_true: np.ndarray
    rows: np.ndarray | None = None   # posiciones (en el componente) de las filas usadas


def cross_validate(X: pd.DataFrame, y: np.ndarray, groups: np.ndarray, model_name: str, k: int, repeats: int, seed: int,
                   rows: np.ndarray | None = None) -> CVResult:
    per_rep = []
    first_pred = None
    for rep in range(repeats):
        pred = np.full(len(y), np.nan)
        for tr, te in participant_folds(groups, k, seed + rep):
            m = make_model(model_name, seed + rep)
            m.fit(X.iloc[tr], y[tr])
            pred[te] = m.predict(X.iloc[te])
        per_rep.append(metrics(y, pred))
        if first_pred is None:
            first_pred = pred.copy()
    frame = pd.DataFrame(per_rep)
    return CVResult("", "", model_name, frame.mean(numeric_only=True).to_dict(), frame.std(numeric_only=True, ddof=0).to_dict(),
                    first_pred, np.asarray(y, dtype=float), rows)


def evaluate_component(df: pd.DataFrame, comp: Component, settings: EvaluationSettings) -> dict:
    """Compara modelos y conjuntos de entradas para un componente. Devuelve resultados y el ganador."""
    sub = df.reset_index(drop=True)
    y = sub[comp.target].to_numpy(dtype=float)
    groups = sub["id_participante"].astype(str).to_numpy()
    results: list[CVResult] = []
    used_rows: dict[str, int] = {}
    reference = cross_validate(pd.DataFrame({"c": np.zeros(len(y))}), y, groups, "media", settings.k_folds, settings.n_repeats, settings.seed)
    for fs_name, cols in FEATURE_SETS.items():
        X = sub[cols]
        ok = X.notna().all(axis=1).to_numpy()
        used_rows[fs_name] = int(ok.sum())
        if ok.sum() < max(settings.min_rows_for_modeling, settings.k_folds):
            continue
        for model_name in MODEL_NAMES:
            r = cross_validate(X[ok].reset_index(drop=True), y[ok], groups[ok], model_name, settings.k_folds, settings.n_repeats, settings.seed,
                               rows=np.where(ok)[0])
            r.component, r.features = comp.key, fs_name
            results.append(r)
    table = [{"modelo": r.model, "entradas": r.features, **{k: round(v, 4) for k, v in r.mean.items()},
              "mae_sd": round(r.sd["mae"], 4)} for r in results]
    base = next((r for r in results if r.model == BASELINE_MODEL and r.features == BASELINE_FEATURES), None)
    winner = min(results, key=lambda r: r.mean["mae"]) if results else None
    # criterio de la matriz de consistencia: MAE y RMSE menores y R² mayor que los de la regresión de base, y MAE menor que predecir la media
    meets = bool(winner and base and winner.mean["mae"] < base.mean["mae"] - 1e-12 and winner.mean["mae"] < reference.mean["mae"]
                 and winner.mean["rmse"] < base.mean["rmse"] and winner.mean["r2"] > base.mean["r2"])
    return {
        "componente": comp.key, "nombre": comp.name, "unidad": comp.unit, "filas_por_conjunto": used_rows,
        "referencia_media_mae": round(reference.mean["mae"], 4),
        "linea_base_mae": round(base.mean["mae"], 4) if base else None,
        "ganador": {"modelo": winner.model, "entradas": winner.features, "mae": round(winner.mean["mae"], 4),
                    "rmse": round(winner.mean["rmse"], 4), "r2": round(winner.mean["r2"], 4), "sesgo": round(winner.mean["sesgo"], 4),
                    "calibracion_pendiente": round(winner.mean["calibracion_pendiente"], 4),
                    "calibracion_intercepto": round(winner.mean["calibracion_intercepto"], 4)} if winner else None,
        "cumple_criterios": meets,
        "salida_en_la_app": "valor continuo" if meets else "Requiere prueba directa",
        "tabla": table,
        "_winner_obj": winner,
    }


def learning_curve(X: pd.DataFrame, y: np.ndarray, groups: np.ndarray, model_name: str, k: int, seed: int,
                   fractions=(0.4, 0.55, 0.7, 0.85, 1.0), repeats: int = 5) -> list[dict]:
    """MAE fuera de muestra según la fracción de participantes disponible para el ajuste."""
    out = []
    rng = np.random.default_rng(seed)
    for frac in fractions:
        maes = []
        for rep in range(repeats):
            pred = np.full(len(y), np.nan)
            for tr, te in participant_folds(groups, k, seed + rep):
                n_use = max(3, int(round(frac * len(tr))))
                tr_sub = rng.permutation(tr)[:n_use]
                m = make_model(model_name, seed + rep)
                m.fit(X.iloc[tr_sub], y[tr_sub])
                pred[te] = m.predict(X.iloc[te])
            maes.append(metrics(y, pred)["mae"])
        out.append({"fraccion_ajuste": frac, "mae": float(np.mean(maes))})
    return out


def xgboost_loss_curve(X: pd.DataFrame, y: np.ndarray, groups: np.ndarray, seed: int, holdout: float = 0.25) -> dict | None:
    """RMSE por iteración en ajuste y validación (un solo corte por participante), para detectar sobreajuste."""
    ids = np.unique(groups)
    if len(ids) < 8:
        return None
    dev, val = holdout_split(list(ids), holdout, seed)
    tr = np.where(np.isin(groups, dev))[0]
    va = np.where(np.isin(groups, val))[0]
    m = XGBRegressor(random_state=seed, eval_metric="rmse", **XGBOOST_PARAMS)
    m.fit(X.iloc[tr], y[tr], eval_set=[(X.iloc[tr], y[tr]), (X.iloc[va], y[va])], verbose=False)
    ev = m.evals_result()
    return {"ajuste": ev["validation_0"]["rmse"], "validacion": ev["validation_1"]["rmse"]}
