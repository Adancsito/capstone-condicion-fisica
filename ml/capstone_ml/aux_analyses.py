"""Análisis de apoyo del informe y del artículo: estabilidad por semilla, curva de pérdida de XGBoost, correlaciones de Spearman,
estadísticos de las siete medidas y descripción de la muestra. Se regeneran con cada reentrenamiento para que las cifras de los documentos
salgan siempre de los datos vigentes.

Uso:  python -m capstone_ml.aux_analyses --out salida/propios
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from xgboost import XGBRegressor

from .config import COMPONENTS, DEFAULT_DATASET, FEATURE_SETS, REPEATABILITY_THRESHOLDS, XGBOOST_PARAMS, EvaluationSettings
from .modeling import evaluate_component, participant_folds
from .pipeline import run_quality

SEEDS = (11, 22, 33, 44, 55)
LABELS = {"peso_kg": "Peso (kg)", "talla_cm": "Talla (cm)", "cintura_cm": "Cintura (cm)", "cadera_cm": "Cadera (cm)", "brazo_cm": "Brazo (cm)",
          "muslo_cm": "Muslo (cm)", "pantorrilla_cm": "Pantorrilla (cm)"}
SHORT = {k: v.split(" (")[0] for k, v in LABELS.items()}


def _es(x: float, d: int = 1) -> str:
    return f"{x:.{d}f}".replace(".", ",").replace("-", "−") if x < 0 else f"{x:.{d}f}".replace(".", ",")


def seed_stability(subs: dict[str, pd.DataFrame], s: EvaluationSettings) -> dict:
    out: dict = {}
    for comp in COMPONENTS:
        rows = []
        for seed in SEEDS:
            r = evaluate_component(subs[comp.key], comp, replace(s, seed=seed))
            g = r["ganador"]
            rows.append({"seed": seed, "ganador": f"{g['modelo']} / {g['entradas']}", "mae": g["mae"], "r2": g["r2"], "cumple": bool(r["cumple_criterios"]),
                         "base": r["linea_base_mae"], "media": r["referencia_media_mae"]})
        out[comp.key] = rows
    return out


def xgb_loss(subs: dict[str, pd.DataFrame], s: EvaluationSettings) -> tuple[dict, dict]:
    """Una partición por participante (70/30): error absoluto medio en ajuste y validación a lo largo de las 150 iteraciones."""
    summary, curves = {}, {}
    cols = FEATURE_SETS["ampliada"]
    for comp in COMPONENTS:
        sub = subs[comp.key].reset_index(drop=True)
        groups = sub["id_participante"].astype(str).to_numpy()
        y = sub[comp.target].to_numpy(float)
        tr, te = next(participant_folds(groups, 3, s.seed))  # un tercio de los participantes para validar
        m = XGBRegressor(random_state=s.seed, eval_metric="mae", **XGBOOST_PARAMS)
        m.fit(sub.loc[tr, cols], y[tr], eval_set=[(sub.loc[tr, cols], y[tr]), (sub.loc[te, cols], y[te])], verbose=False)
        ev = m.evals_result()
        fit, val = ev["validation_0"]["mae"], ev["validation_1"]["mae"]
        summary[comp.key] = {"ajuste_final": float(fit[-1]), "validacion_final": float(val[-1]), "validacion_min": float(min(val)), "iter_min": int(np.argmin(val)) + 1}
        curves[comp.key] = {"ajuste": [float(x) for x in fit], "validacion": [float(x) for x in val]}
    return summary, curves


def spearman(subs: dict[str, pd.DataFrame]) -> dict:
    out: dict = {}
    for m in REPEATABILITY_THRESHOLDS:
        out[SHORT[m]] = {}
        for comp in COMPONENTS:
            sub = subs[comp.key]
            rho, p = spearmanr(sub[f"{m}_prom"], sub[comp.target])
            out[SHORT[m]][comp.key] = [round(float(rho), 2), round(float(p), 4)]
    return out


def x_stats(df: pd.DataFrame) -> dict:
    rows = []
    for m, thr in REPEATABILITY_THRESHOLDS.items():
        a, b = df[f"{m}_1"], df[f"{m}_2"]
        diff = (a - b).abs().round(6)  # evita que 0,2 pase como 0,2000000001 en el umbral
        prom = df[f"{m}_prom"]
        rows.append([LABELS[m], int(prom.notna().sum()), round(float(prom.mean()), 1), round(float(prom.std()), 1), float(prom.min()), float(prom.max()),
                     round(float(diff.mean()), 2), int((diff > thr).sum())])
    return {"x_rows": rows}


def sample_rows(df: pd.DataFrame) -> list[list[str]]:
    fem, mas = df["sexo"] == "F", df["sexo"] == "M"
    spec = [("Edad (años)", "edad_anios", 1), ("Días de entrenamiento por semana", "dias_entreno_sem", 1), ("IMC (kg/m²)", "imc_kg_m2", 1),
            ("Y1 Grasa corporal (%)", "bia_pct_grasa", 1), ("Y2 Tiempo de caminata (s)", "c2km_total_s", 0), ("Y3 Prensión máxima (kg)", "grip_kg_max", 1),
            ("Y4 Sostén del tronco (s)", "trunk_tiempo_s", 0), ("Y5 Alcance sit-and-reach (cm)", "sr_cm_max", 1)]
    rows = []
    for label, col, d in spec:
        v = df[col].astype(float)
        f = lambda x: f"{_es(x.mean(), d)} ± {_es(x.std(), d)}"
        rows.append([label, f(v), f(v[fem]), f(v[mas]), f"{_es(v.min(), d)} a {_es(v.max(), d)}"])
    return rows


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("salida/propios"))
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    a = ap.parse_args(argv)
    from .config import EvaluationSettings as ES

    s = ES()
    from .pipeline import run_quality as rq

    q = rq(a.dataset, s)
    df, elig = q["_df"], q["_elig"]
    subs = {c.key: df.loc[elig.masks[c.key]].reset_index(drop=True) for c in COMPONENTS}
    a.out.mkdir(parents=True, exist_ok=True)
    write = lambda name, obj: (a.out / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    write("estabilidad_semillas.json", seed_stability(subs, s))
    summary, curves = xgb_loss(subs, s)
    write("xgb_loss.json", summary)
    write("xgb_loss_curvas.json", curves)
    write("spearman.json", spearman(subs))
    write("x_stats.json", x_stats(df))
    write("muestra_rows.json", sample_rows(df))
    print("ok:", ", ".join(sorted(p.name for p in a.out.glob("*.json"))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
