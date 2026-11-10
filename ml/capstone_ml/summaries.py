"""Lecturas complementarias de los resultados: porcentajes, desempeño por sexo y estabilidad de la prueba final.

Todo parte de los mismos modelos y la misma validación por participante; aquí solo se mira desde otros ángulos para no quedarse con una
sola cifra.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import FEATURE_SETS, Component, EvaluationSettings
from .modeling import evaluate_component, holdout_split, make_model, metrics


def percentages(res: dict, y_mean: float, y_sd: float = 0.0) -> dict:
    """Las mismas métricas expresadas en porcentaje, que es como suelen leerse."""
    g = res["ganador"]
    base, ref = res["linea_base_mae"], res["referencia_media_mae"]
    return {
        "r2_pct": round(100 * g["r2"], 1),
        # si la media está cerca de cero (p. ej. sit-and-reach con el cero en los pies) el cociente no significa nada
        "mae_pct_de_la_media": round(100 * g["mae"] / abs(y_mean), 1) if y_mean and abs(y_mean) > 2 * y_sd else None,
        "mejora_vs_linea_base_pct": round(100 * (1 - g["mae"] / base), 1) if base else None,
        "mejora_vs_media_pct": round(100 * (1 - g["mae"] / ref), 1) if ref else None,
    }


def by_sex(sub: pd.DataFrame, winner) -> dict:
    """Desempeño del ganador dentro de cada sexo. Si casi toda la capacidad viene de separar hombres y mujeres, aquí se nota."""
    out = {}
    if winner is None or winner.rows is None or "sexo" not in sub.columns:
        return out
    sex = sub.iloc[winner.rows]["sexo"].to_numpy()
    for s in ("F", "M"):
        m = sex == s
        if m.sum() >= 5:
            r = metrics(winner.oof_true[m], winner.oof_pred[m])
            out[s] = {"n": int(m.sum()), "mae": round(r["mae"], 3), "r2": round(r["r2"], 3), "media_observada": round(float(winner.oof_true[m].mean()), 2)}
    return out


def holdout_stability(sub: pd.DataFrame, comp: Component, settings: EvaluationSettings, fraction: float, repeats: int) -> dict:
    """Repite la prueba final con particiones distintas (el modelo se elige cada vez solo con el desarrollo) y resume cuánto varía."""
    inner = EvaluationSettings(min_rows_for_modeling=settings.min_rows_for_modeling, k_folds=settings.k_folds, n_repeats=1, seed=settings.seed)
    ids = sub["id_participante"].astype(str).tolist()
    rows, families = [], []
    for r in range(repeats):
        seed = settings.seed + 1000 + r
        dev_ids, test_ids = holdout_split(ids, fraction, seed)
        dev = sub[sub["id_participante"].astype(str).isin(dev_ids)].reset_index(drop=True)
        test = sub[sub["id_participante"].astype(str).isin(test_ids)].reset_index(drop=True)
        inner.seed = seed
        res = evaluate_component(dev, comp, inner)
        win = res.pop("_winner_obj")
        if win is None:
            continue
        cols = FEATURE_SETS[win.features]
        okd, okt = dev[cols].notna().all(axis=1), test[cols].notna().all(axis=1)
        model = make_model(win.model, seed).fit(dev.loc[okd, cols], dev.loc[okd, comp.target].to_numpy(float))
        fin = metrics(test.loc[okt, comp.target].to_numpy(float), model.predict(test.loc[okt, cols]))
        bcols = FEATURE_SETS["basica"]
        okb = test[bcols].notna().all(axis=1) & test[comp.target].notna()
        base = make_model("lineal", seed).fit(dev.loc[dev[bcols].notna().all(axis=1), bcols], dev.loc[dev[bcols].notna().all(axis=1), comp.target].to_numpy(float))
        base_m = metrics(test.loc[okb, comp.target].to_numpy(float), base.predict(test.loc[okb, bcols]))
        mean_pred = float(dev[comp.target].mean())
        mean_mae = float(np.mean(np.abs(test[comp.target].to_numpy(float) - mean_pred)))
        rows.append({"mae": fin["mae"], "r2": fin["r2"], "base_mae": base_m["mae"], "media_mae": mean_mae, "n_test": int(okt.sum()),
                     "gana_a_la_base": bool(fin["mae"] < base_m["mae"]), "gana_a_la_media": bool(fin["mae"] < mean_mae)})
        families.append(f"{win.model} / {win.features}")
    if not rows:
        return {}
    f = pd.DataFrame(rows)
    return {
        "particiones": int(len(f)), "fraccion_de_prueba": fraction, "n_test_medio": round(float(f["n_test"].mean()), 1),
        "mae_media": round(float(f["mae"].mean()), 3), "mae_sd": round(float(f["mae"].std(ddof=0)), 3),
        "mae_min_max": [round(float(f["mae"].min()), 3), round(float(f["mae"].max()), 3)],
        "r2_media": round(float(f["r2"].mean()), 3), "r2_sd": round(float(f["r2"].std(ddof=0)), 3),
        "base_mae_media": round(float(f["base_mae"].mean()), 3), "media_mae_media": round(float(f["media_mae"].mean()), 3),
        "pct_particiones_que_superan_la_base": round(100 * float(f["gana_a_la_base"].mean()), 0),
        "pct_particiones_que_superan_la_media": round(100 * float(f["gana_a_la_media"].mean()), 0),
        "modelos_elegidos": pd.Series(families).value_counts().to_dict(),
    }
