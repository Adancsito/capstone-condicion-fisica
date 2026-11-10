"""Análisis complementarios para el artículo: validación anidada, intervalos de confianza, efecto del sexo, matrices de confusión y condiciones de la medición.

Responden a lo que pide la revisión: cómo evitar el optimismo al elegir el ganador con los mismos datos, cuánta cautela merece el criterio de éxito, qué parte
del R² viene del sexo y qué pasaría si se clasificaran los valores en niveles. No sustituyen a los resultados principales: se informan al lado de ellos.

Uso:  python -m capstone_ml.extra_analyses --out salida/propios/extra
"""
from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

from .config import COMPONENTS, DEFAULT_DATASET, FEATURE_SETS, EvaluationSettings
from .modeling import MODEL_NAMES, cross_validate, make_model, metrics, participant_folds
from .pipeline import run_quality

OUTER_K, OUTER_REPEATS, INNER_K, N_BOOT = 5, 3, 4, 2000


# ------------------------------------------------------------------------------------------- validación anidada
def _select(sub: pd.DataFrame, comp, train_idx: np.ndarray, seed: int) -> tuple[str, str]:
    """Elige la mejor de las 12 combinaciones usando SOLO los participantes de entrenamiento (validación interna)."""
    tr = sub.iloc[train_idx].reset_index(drop=True)
    y = tr[comp.target].to_numpy(float)
    groups = tr["id_participante"].astype(str).to_numpy()
    best, best_mae = None, np.inf
    for fs, cols in FEATURE_SETS.items():
        ok = tr[cols].notna().all(axis=1).to_numpy()
        if ok.sum() < INNER_K + 2:
            continue
        for name in MODEL_NAMES:
            r = cross_validate(tr.loc[ok, cols].reset_index(drop=True), y[ok], groups[ok], name, INNER_K, 1, seed)
            if r.mean["mae"] < best_mae:
                best, best_mae = (name, fs), r.mean["mae"]
    return best  # type: ignore[return-value]


def _nested_component(args: tuple) -> dict:
    sub, comp_key, seed0 = args
    comp = next(c for c in COMPONENTS if c.key == comp_key)
    y = sub[comp.target].to_numpy(float)
    groups = sub["id_participante"].astype(str).to_numpy()
    rows, chosen = [], []
    for rep in range(OUTER_REPEATS):
        seed = seed0 + 100 * rep
        pred = np.full(len(y), np.nan)
        base = np.full(len(y), np.nan)
        mean = np.full(len(y), np.nan)
        for tr, te in participant_folds(groups, OUTER_K, seed):
            name, fs = _select(sub, comp, tr, seed)
            chosen.append(f"{name} / {fs}")
            cols = FEATURE_SETS[fs]
            ok = sub.iloc[tr][cols].notna().all(axis=1).to_numpy()
            m = make_model(name, seed).fit(sub.iloc[tr][cols][ok], y[tr][ok])
            pred[te] = m.predict(sub.iloc[te][cols])
            b = make_model("lineal", seed).fit(sub.iloc[tr][FEATURE_SETS["basica"]], y[tr])
            base[te] = b.predict(sub.iloc[te][FEATURE_SETS["basica"]])
            mean[te] = y[tr].mean()
        rows.append({"modelo": metrics(y, pred), "base": metrics(y, base), "media": metrics(y, mean)})
    agg = lambda k, m: float(np.mean([r[k][m] for r in rows]))
    sd = lambda k, m: float(np.std([r[k][m] for r in rows]))
    from collections import Counter

    return {"componente": comp_key,
            "modelo": {m: agg("modelo", m) for m in ("mae", "rmse", "r2")}, "modelo_sd": {m: sd("modelo", m) for m in ("mae", "rmse", "r2")},
            "base": {m: agg("base", m) for m in ("mae", "rmse", "r2")}, "media": {m: agg("media", m) for m in ("mae", "rmse", "r2")},
            "elegidos": dict(Counter(chosen).most_common())}


# ------------------------------------------------------------------------------------------- bootstrap por participante
def _bootstrap(y: np.ndarray, p_win: np.ndarray, p_base: np.ndarray, seed: int) -> dict:
    rng = np.random.default_rng(seed)
    n = len(y)
    d_mae, d_rmse, d_r2 = [], [], []
    for _ in range(N_BOOT):
        i = rng.integers(0, n, n)
        yy, a, b = y[i], p_win[i], p_base[i]
        if np.var(yy) == 0:
            continue
        d_mae.append(np.mean(np.abs(yy - a)) - np.mean(np.abs(yy - b)))
        d_rmse.append(np.sqrt(np.mean((yy - a) ** 2)) - np.sqrt(np.mean((yy - b) ** 2)))
        r2 = lambda p: 1 - np.sum((yy - p) ** 2) / np.sum((yy - yy.mean()) ** 2)
        d_r2.append(r2(a) - r2(b))
    d_mae, d_rmse, d_r2 = map(np.array, (d_mae, d_rmse, d_r2))
    ci = lambda x: [float(np.percentile(x, 2.5)), float(np.percentile(x, 97.5))]
    return {"d_mae": float(np.mean(d_mae)), "d_mae_ic95": ci(d_mae), "d_rmse": float(np.mean(d_rmse)), "d_rmse_ic95": ci(d_rmse),
            "d_r2": float(np.mean(d_r2)), "d_r2_ic95": ci(d_r2),
            "pct_cumple_los_tres": float(np.mean((d_mae < 0) & (d_rmse < 0) & (d_r2 > 0)) * 100)}


# ------------------------------------------------------------------------------------------- niveles y matriz de confusión
def _terciles_by_sex(y: np.ndarray, sex: np.ndarray) -> np.ndarray:
    """Clase 0, 1 o 2 según el tercil del valor observado dentro de cada sexo."""
    cls = np.zeros(len(y), dtype=int)
    for s in np.unique(sex):
        m = sex == s
        lo, hi = np.percentile(y[m], [100 / 3, 200 / 3])
        cls[m] = np.where(y[m] <= lo, 0, np.where(y[m] <= hi, 1, 2))
    return cls


def _confusion(y: np.ndarray, pred: np.ndarray, sex: np.ndarray) -> dict:
    # los umbrales de cada sexo salen de los valores observados; se aplican igual a lo observado y a lo estimado
    thr = {}
    for s in np.unique(sex):
        m = sex == s
        thr[s] = np.percentile(y[m], [100 / 3, 200 / 3])

    def classify(v, s):
        lo, hi = thr[s]
        return 0 if v <= lo else (1 if v <= hi else 2)

    true = np.array([classify(v, s) for v, s in zip(y, sex)])
    est = np.array([classify(v, s) for v, s in zip(pred, sex)])
    cm = np.zeros((3, 3), dtype=int)
    for t, e in zip(true, est):
        cm[t, e] += 1
    recall = [cm[i, i] / cm[i].sum() if cm[i].sum() else np.nan for i in range(3)]
    return {"matriz": cm.tolist(), "exactitud": float(np.trace(cm) / cm.sum()), "exactitud_balanceada": float(np.nanmean(recall)),
            "sensibilidad_por_nivel": [None if np.isnan(r) else float(r) for r in recall]}


# ------------------------------------------------------------------------------------------- principal
def run(out: Path, dataset: Path, results_json: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    s = EvaluationSettings()
    q = run_quality(dataset, s)
    df, elig = q["_df"], q["_elig"]
    res = json.load(open(results_json, encoding="utf-8"))
    subs = {c.key: df.loc[elig.masks[c.key]].reset_index(drop=True) for c in COMPONENTS}

    with ProcessPoolExecutor(max_workers=5) as ex:
        nested = list(ex.map(_nested_component, [(subs[c.key], c.key, s.seed) for c in COMPONENTS]))
    summary: dict = {"anidada": {n["componente"]: n for n in nested}, "bootstrap": {}, "sexo": {}, "confusion": {}, "condiciones": {}}

    for comp in COMPONENTS:
        sub = subs[comp.key]
        r = res[comp.key]
        g = r["ganador"]
        y = sub[comp.target].to_numpy(float)
        groups = sub["id_participante"].astype(str).to_numpy()
        sex = sub["sexo"].to_numpy()
        cols = FEATURE_SETS[g["entradas"]]
        win = cross_validate(sub[cols], y, groups, g["modelo"], s.k_folds, s.n_repeats, s.seed)
        base = cross_validate(sub[FEATURE_SETS["basica"]], y, groups, "lineal", s.k_folds, s.n_repeats, s.seed)
        summary["bootstrap"][comp.key] = _bootstrap(win.oof_true, win.oof_pred, base.oof_pred, s.seed)
        # sexo: modelo con solo el sexo frente al ganador
        sx = cross_validate(sub[["sexo_f"]], y, groups, "lineal", s.k_folds, s.n_repeats, s.seed)
        within = {}
        for lab in ("F", "M"):
            m = sex == lab
            within[lab] = {"n": int(m.sum()), **{k: float(v) for k, v in metrics(win.oof_true[m], win.oof_pred[m]).items() if k in ("mae", "r2")},
                           "sd_observado": float(np.std(y[m], ddof=1))}
        summary["sexo"][comp.key] = {"r2_solo_sexo": sx.mean["r2"], "r2_ganador": win.mean["r2"], "mae_solo_sexo": sx.mean["mae"], "mae_ganador": win.mean["mae"],
                                     "dentro_de_cada_sexo": within,
                                     "medias": {lab: float(y[sex == lab].mean()) for lab in ("F", "M")}}
        summary["confusion"][comp.key] = _confusion(win.oof_true, win.oof_pred, sex)
        # condiciones de la medición (solo grasa por bioimpedancia, que es la afectada)
        if comp.key == "Y1":
            resid = np.abs(win.oof_true - win.oof_pred)
            def grp(col, cond):
                m = cond(sub[col]).to_numpy()
                return {"n": int(m.sum()), "error_absoluto_medio": float(resid[m].mean()) if m.any() else None}
            summary["condiciones"] = {
                "ejercicio_24h": {"si": grp("bia_ejercicio_24h", lambda c: c == "Sí"), "no": grp("bia_ejercicio_24h", lambda c: c == "No")},
                "hidratacion": {k: grp("bia_hidratacion", lambda c, k=k: c == k) for k in ("habitual", "poca", "mucha")},
                "horas_ultima_comida": {"min": float(sub["bia_horas_ultima_comida"].min()), "max": float(sub["bia_horas_ultima_comida"].max()),
                                        "media": float(sub["bia_horas_ultima_comida"].mean())},
            }
    (out / "analisis_complementarios.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    return summary


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("salida/propios/extra"))
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    ap.add_argument("--resultados", type=Path, default=Path("salida/propios/resultados.json"))
    a = ap.parse_args(argv)
    summary = run(a.out, a.dataset, a.resultados)
    for k, v in summary["anidada"].items():
        print(k, "anidada MAE", round(v["modelo"]["mae"], 3), "base", round(v["base"]["mae"], 3), "media", round(v["media"]["mae"], 3))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
