"""Medición rápida (peso, talla, edad y sexo): desempeño frente a la regresión de peso y talla, con intervalos de confianza por remuestreo.
Uso: python -m capstone_ml.quick_analysis"""
import json
import sys
from pathlib import Path

import numpy as np

from .config import COMPONENTS, DEFAULT_DATASET, FEATURE_SETS, EvaluationSettings
from .extra_analyses import _bootstrap
from .modeling import MODEL_NAMES, cross_validate
from .pipeline import run_quality

def main() -> None:
    s = EvaluationSettings()
    q = run_quality(DEFAULT_DATASET, s)
    df, elig = q["_df"], q["_elig"]
    out = {}
    for c in COMPONENTS:
        sub = df.loc[elig.masks[c.key]].reset_index(drop=True)
        y = sub[c.target].to_numpy(float)
        g = sub["id_participante"].astype(str).to_numpy()
        base = cross_validate(sub[FEATURE_SETS["basica"]], y, g, "lineal", s.k_folds, s.n_repeats, s.seed)
        best = None
        for m in MODEL_NAMES:
            r = cross_validate(sub[FEATURE_SETS["basica_edad_sexo"]], y, g, m, s.k_folds, s.n_repeats, s.seed)
            if best is None or r.mean["mae"] < best[1].mean["mae"]:
                best = (m, r)
        m, r = best
        b = _bootstrap(r.oof_true, r.oof_pred, base.oof_pred, s.seed)
        out[c.key] = {"modelo": m, "mae": r.mean["mae"], "rmse": r.mean["rmse"], "r2": r.mean["r2"], "base_mae": base.mean["mae"], "base_rmse": base.mean["rmse"], "base_r2": base.mean["r2"],
                      "cumple": bool(r.mean["mae"] < base.mean["mae"] and r.mean["rmse"] < base.mean["rmse"] and r.mean["r2"] > base.mean["r2"]),
                      "d_mae_ic": b["d_mae_ic95"], "d_rmse_ic": b["d_rmse_ic95"], "d_r2_ic": b["d_r2_ic95"], "pct3": b["pct_cumple_los_tres"]}
        print(c.key, m, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in out[c.key].items() if k != "modelo"}, flush=True)
    json.dump(out, open(Path("salida/propios/extra/modo_rapido.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)



if __name__ == "__main__":
    main()
