"""Exportación del paquete de modelo (JSON) que evalúa la aplicación, y de los casos de prueba de paridad.

La app no entrena: lee este archivo. Un paquete con `isDemo: true` jamás debe llegar a producción.

Uso:
    python -m capstone_ml.export --demo-sintetico --out ../public/model-bundles/demo.json
    python -m capstone_ml.export --paridad ../src/app/core/model/testdata/parity.json
    python -m capstone_ml.export --dataset RUTA --out bundle.json        # con datos reales (exige filas suficientes)
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from xgboost import XGBRegressor

from .config import (BASIC_X, COMPONENTS, COVARIATES, DEFAULT_DATASET, EXTENDED_X, FEATURE_SETS, MIN_ROWS_RELIABLE,
                     RANDOM_FOREST_PARAMS, XGBOOST_PARAMS, EvaluationSettings)
from .data import add_derived, read_validation_ranges
from .modeling import evaluate_component, make_model
from .quality import eligibility

SCHEMA_VERSION = 1

# Texto de ayuda de cada entrada de la aplicación (mismo procedimiento que la ficha de registro).
INPUT_META = {
    "edad_anios": ("Edad", "años", "number", "Años cumplidos."),
    "sexo_f": ("Sexo de referencia", "", "sex", "Se usa solo como referencia del modelo."),
    "peso_kg_prom": ("Peso", "kg", "number", "Sin calzado y con ropa ligera, quieto y centrado sobre la balanza. Si puedes, mide dos veces y promedia."),
    "talla_cm_prom": ("Talla", "cm", "number", "Sin calzado, talones apoyados y postura erguida. Si puedes, mide dos veces y promedia."),
    "cintura_cm_prom": ("Cintura", "cm", "number", "Con cinta no extensible, en un punto fijo y sin apretar la piel. Dos lecturas, se promedian."),
    "cadera_cm_prom": ("Cadera", "cm", "number", "Con cinta no extensible, en un punto fijo. Dos lecturas, se promedian."),
    "brazo_cm_prom": ("Circunferencia del brazo", "cm", "number", "Con cinta no extensible, siempre en el mismo lado y en el mismo punto. Dos lecturas, se promedian."),
    "muslo_cm_prom": ("Circunferencia del muslo", "cm", "number", "Con cinta no extensible, siempre en el mismo lado y en el mismo punto. Dos lecturas, se promedian."),
    "pantorrilla_cm_prom": ("Circunferencia de la pantorrilla", "cm", "number", "Con cinta no extensible, siempre en el mismo lado y en el mismo punto. Dos lecturas, se promedian."),
}
INPUT_BOUNDS = {  # rangos de plausibilidad de la base de datos (avisos de captura)
    "edad_anios": (18, 40), "sexo_f": (0, 1), "peso_kg_prom": (30, 250), "talla_cm_prom": (120, 230), "cintura_cm_prom": (40, 200),
    "cadera_cm_prom": (50, 200), "brazo_cm_prom": (15, 60), "muslo_cm_prom": (30, 100), "pantorrilla_cm_prom": (20, 70),
}
DIRECT_TEST = {
    "Y1": "Bioimpedancia con un equipo fijo, antes de cualquier esfuerzo.",
    "Y2": "Caminata de 2 km en recorrido medido, con frecuencia cardiaca final.",
    "Y3": "Prensión manual máxima con dinamómetro, tres intentos.",
    "Y4": "Sostén isométrico de los extensores del tronco (Biering-Sørensen), cronometrado.",
    "Y5": "Sit-and-reach con cajón, tres intentos.",
}


# ----------------------------------------------------------------------------- modelos a JSON
def linear_spec(m: LinearRegression) -> dict:
    return {"type": "linear", "intercept": float(m.intercept_), "coef": [float(c) for c in m.coef_]}


def forest_spec(m: RandomForestRegressor) -> dict:
    trees = []
    for est in m.estimators_:
        t = est.tree_
        trees.append({
            "left": t.children_left.tolist(), "right": t.children_right.tolist(), "feature": t.feature.tolist(),
            "threshold": [float(x) for x in t.threshold], "value": [float(x) for x in t.value[:, 0, 0]],
        })
    return {"type": "random_forest", "trees": trees}


def _base_score(booster) -> float:
    raw = json.loads(booster.save_config())["learner"]["learner_model_param"]["base_score"]
    return float(str(raw).strip("[]"))


def xgboost_spec(m: XGBRegressor, features: list[str]) -> dict:
    booster = m.get_booster()
    index = {f: i for i, f in enumerate(features)}
    trees = []
    for dump in booster.get_dump(dump_format="json"):
        root = json.loads(dump)
        nodes: dict[int, dict] = {}

        def walk(n):
            nodes[n["nodeid"]] = n
            for c in n.get("children", []) or []:
                walk(c)

        walk(root)
        size = max(nodes) + 1
        feat, thr, yes, no, miss, leaf = [-1] * size, [0.0] * size, [-1] * size, [-1] * size, [-1] * size, [0.0] * size
        for nid, n in nodes.items():
            if "leaf" in n:
                leaf[nid] = float(n["leaf"])
            else:
                feat[nid] = index[n["split"]]
                thr[nid] = float(n["split_condition"])
                yes[nid], no[nid], miss[nid] = int(n["yes"]), int(n["no"]), int(n["missing"])
        trees.append({"feature": feat, "threshold": thr, "yes": yes, "no": no, "missing": miss, "leaf": leaf})
    return {"type": "xgboost", "baseScore": _base_score(booster), "trees": trees}


def model_spec(model, name: str, features: list[str]) -> dict:
    if name == "lineal":
        return linear_spec(model)
    if name == "random_forest":
        return forest_spec(model)
    if name == "xgboost":
        return xgboost_spec(model, features)
    raise ValueError(name)


# ----------------------------------------------------------------------------- evidencia
def evidence_of(key: str, meets: bool) -> str | None:
    """'solida' si el intervalo de confianza de la diferencia con la base excluye el cero (MAE y R²); 'limitada' si el componente cumple pero el intervalo lo incluye."""
    path = Path("salida/propios/extra/analisis_complementarios.json")
    if not meets or not path.exists():
        return None
    b = json.loads(path.read_text(encoding="utf-8"))["bootstrap"].get(key)
    if not b:
        return None
    return "solida" if (b["d_mae_ic95"][1] < 0 and b["d_r2_ic95"][0] > 0) else "limitada"


# ----------------------------------------------------------------------------- medición rápida
def quick_spec(res: dict, sub: pd.DataFrame, comp, settings: EvaluationSettings, validation_text: str) -> dict | None:
    """Modelo de la medición rápida (peso, talla, edad y sexo): el de menor MAE entre los tres con ese conjunto de entradas.
    Se evalúa con el mismo criterio que el modelo completo: MAE, RMSE y R² mejores que la regresión de peso y talla, y MAE menor que el de la media."""
    rows = [t for t in res["tabla"] if t["entradas"] == "basica_edad_sexo"]
    base = next((t for t in res["tabla"] if t["entradas"] == "basica" and t["modelo"] == "lineal"), None)
    if not rows or base is None:
        return None
    best = min(rows, key=lambda t: t["mae"])
    cols = FEATURE_SETS["basica_edad_sexo"]
    ok = sub[cols].notna().all(axis=1)
    X, y = sub.loc[ok, cols], sub.loc[ok, comp.target].to_numpy(float)
    model = make_model(best["modelo"], settings.seed).fit(X, y)
    meets = bool(best["mae"] < base["mae"] and best["rmse"] < base["rmse"] and best["r2"] > base["r2"] and best["mae"] < res["referencia_media_mae"] and len(sub) >= MIN_ROWS_RELIABLE)
    return {
        "features": cols, "model": model_spec(model, best["modelo"], cols),
        "family": {"lineal": "regresión lineal", "random_forest": "Random Forest", "xgboost": "XGBoost"}[best["modelo"]],
        "featureSet": "basica_edad_sexo", "meetsCriteria": meets,
        "metrics": {"mae": best["mae"], "rmse": best["rmse"], "r2": best["r2"], "bias": best["sesgo"], "baselineMae": base["mae"], "n": int(len(sub)), "validation": validation_text},
        "trainRange": {c: [float(X[c].min()), float(X[c].max())] for c in cols},
    }


# ----------------------------------------------------------------------------- paquete
def build_bundle(df: pd.DataFrame, settings: EvaluationSettings, is_demo: bool, description: str,
                 validation_text: str = "validación cruzada por participante (exploratoria)", data_source: str | None = None) -> dict:
    elig = eligibility(df, settings.exclude_ids)
    used_features: list[str] = []
    components = []
    for comp in COMPONENTS:
        sub = df.loc[elig.masks[comp.key]].reset_index(drop=True)
        base = {"key": comp.key, "name": comp.name, "unit": comp.unit, "directTest": DIRECT_TEST[comp.key], "note": comp.note or None}
        if len(sub) < max(settings.min_rows_for_modeling, settings.k_folds):
            components.append({**base, "features": [], "model": None, "meetsCriteria": False,
                               "metrics": None, "trainRange": {}, "trainN": int(len(sub))})
            continue
        res = evaluate_component(sub, comp, settings)
        win = res.pop("_winner_obj")
        cols = FEATURE_SETS[win.features]
        ok = sub[cols].notna().all(axis=1)
        X, y = sub.loc[ok, cols], sub.loc[ok, comp.target].to_numpy(float)
        model = make_model(win.model, settings.seed).fit(X, y)
        used_features += [c for c in cols if c not in used_features]
        quick = quick_spec(res, sub, comp, settings, validation_text)
        if quick:
            used_features += [c for c in quick["features"] if c not in used_features]
        components.append({
            **base, "features": cols, "model": model_spec(model, win.model, cols),
            "family": {"lineal": "regresión lineal", "random_forest": "Random Forest", "xgboost": "XGBoost"}[win.model],
            "featureSet": win.features,
            "meetsCriteria": bool(res["cumple_criterios"] and len(sub) >= MIN_ROWS_RELIABLE),
            "metrics": {"mae": res["ganador"]["mae"], "rmse": res["ganador"]["rmse"], "r2": res["ganador"]["r2"],
                        "bias": res["ganador"]["sesgo"], "baselineMae": res["linea_base_mae"], "n": int(len(sub)),
                        "validation": validation_text},
            "trainRange": {c: [float(X[c].min()), float(X[c].max())] for c in cols},
            "trainN": int(len(sub)),
            "observedRange": [float(y.min()), float(y.max())],
            "quick": quick,
            "evidence": evidence_of(comp.key, bool(res["cumple_criterios"] and len(sub) >= MIN_ROWS_RELIABLE)),
        })
    inputs = []
    for key in used_features:
        label, unit, kind, help_ = INPUT_META[key]
        lo, hi = INPUT_BOUNDS[key]
        inputs.append({"key": key, "label": label, "unit": unit, "type": kind, "min": lo, "max": hi, "help": help_})
    return {
        "manifest": {
            "schemaVersion": SCHEMA_VERSION,
            "bundleVersion": ("demo-" if is_demo else "") + datetime.now(timezone.utc).strftime("%Y%m%d%H%M"),
            "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "isDemo": is_demo,
            "description": description,
            "population": "Adultos de 18 a 40 años",
            "trainedRows": int(len(df)),
            "validationNote": "Con muestras pequeñas la validación es inestable; los valores son orientativos.",
            "dataSource": data_source,
        },
        "inputs": inputs,
        "components": components,
        "levels": None,
    }


# ----------------------------------------------------------------------------- datos sintéticos de demostración
def demo_sessions(n: int = 80, seed: int = 7) -> pd.DataFrame:
    """Datos INVENTADOS para la demostración visual de la app. No representan a nadie."""
    from tests.synthetic import make_sessions

    d = make_sessions(n, seed)
    rng = np.random.default_rng(seed + 1)
    peso = d["peso_kg_1"].to_numpy(float)
    edad = d["edad_anios"].to_numpy(float)
    mujer = (d["sexo"] == "F").to_numpy(float)
    # flexibilidad y resistencia con alguna relación para que la demostración muestre tarjetas de ambos estados
    flex = 4 + 8 * mujer - 0.12 * (peso - 72) - 0.15 * (edad - 30) + rng.normal(0, 4, n)
    for i in (1, 2, 3):
        d[f"sr_cm_{i}"] = np.round(flex + rng.normal(0, 0.8, n), 1)
    # grasa corporal con un orden de magnitud verosímil para que la demostración no desentone (dato inventado)
    talla = d["talla_cm_1"].to_numpy(float)
    imc = peso / (talla / 100) ** 2
    d["bia_pct_grasa"] = np.round(1.2 * imc + 0.23 * edad - 10.8 * (1 - mujer) - 5.4 + rng.normal(0, 2.0, n), 1)
    return add_derived(d)


# ----------------------------------------------------------------------------- casos de paridad
def parity_cases(path: Path, n_cases: int = 25, seed: int = 11) -> None:
    from tests.synthetic import make_sessions

    df = add_derived(make_sessions(70, seed))
    features = EXTENDED_X + COVARIATES
    y = df["grip_kg_max"].to_numpy(float)
    X = df[features]
    models = {
        "linear": LinearRegression().fit(X, y),
        "random_forest": RandomForestRegressor(random_state=seed, **{**RANDOM_FOREST_PARAMS, "n_estimators": 40}).fit(X, y),
        "xgboost": XGBRegressor(random_state=seed, **{**XGBOOST_PARAMS, "n_estimators": 60}).fit(X, y),
    }
    specs = {"linear": linear_spec(models["linear"]), "random_forest": forest_spec(models["random_forest"]),
             "xgboost": xgboost_spec(models["xgboost"], features)}
    rng = np.random.default_rng(seed + 5)
    cases = []
    lo, hi = X.min(), X.max()
    for _ in range(n_cases):
        row = {c: float(np.round(rng.uniform(lo[c], hi[c]), 1)) for c in features}
        row["sexo_f"] = float(rng.integers(0, 2))
        row["edad_anios"] = float(rng.integers(20, 40))
        frame = pd.DataFrame([row])[features]
        cases.append({"inputs": row, "expected": {k: float(m.predict(frame)[0]) for k, m in models.items()}})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"features": features, "models": specs, "cases": cases,
                                "nota": "DATOS SINTÉTICOS: solo prueban que la app calcula lo mismo que scikit-learn y XGBoost."}), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", type=Path, default=None)
    ap.add_argument("--demo-sintetico", action="store_true")
    ap.add_argument("--demo-externo", type=Path, default=None, help="Base externa (formato de la base de sesiones) para una demostración con datos públicos reales.")
    ap.add_argument("--paridad", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=None)
    a = ap.parse_args(argv)
    if a.paridad:
        parity_cases(a.paridad)
        print("Casos de paridad:", a.paridad)
        return 0
    settings = EvaluationSettings()
    if a.demo_externo:
        from .data import load_sessions

        df = load_sessions(a.demo_externo)
        bundle = build_bundle(
            df, settings, True,
            "DEMOSTRACIÓN: modelos entrenados con 128 adultos de un conjunto público de otra población y otro protocolo. Los valores son ilustrativos y no provienen del estudio.",
            validation_text="validación cruzada por participante sobre datos públicos externos",
            data_source="Třebický V, et al. (2026). A multi-domain physical fitness dataset of Central European adults. Sci Data 13: 776. CC BY 4.0. https://doi.org/10.1038/s41597-026-07094-6")
    elif a.demo_sintetico:
        df = demo_sessions()
        bundle = build_bundle(df, settings, True, "DEMOSTRACIÓN: modelos entrenados con datos inventados. Los valores son ilustrativos y no provienen del estudio.")
    else:
        from .data import load_sessions

        df = load_sessions(a.dataset or DEFAULT_DATASET)
        bundle = build_bundle(df, settings, False,
                              f"Modelos preliminares entrenados con los {len(df)} participantes del estudio (validación cruzada por participante, sin prueba final). Son orientativos.",
                              validation_text="validación cruzada por participante (5 pliegues × 5 repeticiones), sin prueba final")
    if not a.out:
        raise SystemExit("Indica --out con la ruta del paquete.")
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ok = [c["key"] for c in bundle["components"] if c["meetsCriteria"]]
    print(f"Paquete {bundle['manifest']['bundleVersion']} ({'DEMOSTRACIÓN' if bundle['manifest']['isDemo'] else 'estudio'}):",
          f"{a.out.stat().st_size / 1024:.0f} kB; componentes que cumplen: {ok or 'ninguno'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
