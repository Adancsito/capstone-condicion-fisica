"""Flujo completo: lee la base, controla la calidad, decide si hay datos para entrenar y, solo entonces, entrena."""
from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

from .config import COMPONENTS, DEFAULT_DATASET, FEATURE_SETS, MIN_ROWS_RELIABLE, EvaluationSettings, Component
from .data import load_many, read_validation_ranges
from .modeling import evaluate_component, holdout_split, learning_curve, make_model, metrics, xgboost_loss_curve
from . import quality, summaries


def run_quality(path: Path, settings: EvaluationSettings, external: list[Path] | None = None) -> dict:
    df = load_many(path, external)
    ranges = read_validation_ranges(path)
    elig = quality.eligibility(df, settings.exclude_ids)
    availability = {}
    for comp in COMPONENTS:
        n_ok = int(elig.masks[comp.key].sum())
        availability[comp.key] = {
            "nombre": comp.name, "unidad": comp.unit, "n_disponible": n_ok,
            "excluidos": elig.reasons[comp.key], "nota": comp.note,
            "alcanza_para_modelar": n_ok >= max(settings.min_rows_for_modeling, settings.k_folds),
        }
    flags = quality.repeatability_flags(df)
    report = {
        "archivo": str(path),
        "muestra": quality.describe_sample(df),
        "participantes": [str(x) for x in df["id_participante"]],
        "ids_duplicados": quality.duplicated_ids(df),
        "campos_obligatorios_vacios": quality.missing_required(df),
        "disponibilidad_por_componente": availability,
        "repetibilidad_fuera_de_umbral": flags.to_dict(orient="records"),
        "repetibilidad_por_participante": {str(k): int(v) for k, v in flags.groupby("id_participante").size().items()},
        "fuera_de_rango_plausible": quality.out_of_range(df, ranges).to_dict(orient="records"),
        "coherencia": quality.recompute_check(df),
        "observaciones_registradas": {str(r["id_participante"]): r["observaciones"] for _, r in df.iterrows()
                                     if isinstance(r.get("observaciones"), str)},
        "parametros_provisionales": asdict(settings),
    }
    report["_df"] = df
    report["_elig"] = elig
    return report


def run_models(df: pd.DataFrame, elig: quality.Eligibility, settings: EvaluationSettings, figures_dir: Path | None = None) -> dict:
    """Entrena y evalúa por componente. Solo se llama si hay datos suficientes."""
    results = {}
    for comp in COMPONENTS:
        mask = elig.masks[comp.key]
        sub = df.loc[mask].reset_index(drop=True)
        enough = len(sub) >= max(settings.min_rows_for_modeling, settings.k_folds)
        if not enough:
            results[comp.key] = {"componente": comp.key, "nombre": comp.name, "estado": "datos insuficientes",
                                 "n": int(len(sub)), "salida_en_la_app": "Requiere prueba directa"}
            continue
        if settings.holdout_fraction:
            dev_ids, test_ids = holdout_split(sub["id_participante"].astype(str).tolist(), settings.holdout_fraction, settings.seed)
            dev = sub[sub["id_participante"].astype(str).isin(dev_ids)].reset_index(drop=True)
            test = sub[sub["id_participante"].astype(str).isin(test_ids)].reset_index(drop=True)
        else:
            dev, test = sub, None
        res = evaluate_component(dev, comp, settings)
        winner = res.pop("_winner_obj")
        if winner is not None:
            res["porcentajes"] = summaries.percentages(res, float(dev[comp.target].mean()), float(dev[comp.target].std()))
            res["por_sexo"] = summaries.by_sex(dev.reset_index(drop=True), winner)
        if settings.holdout_repeats > 1:
            frac = settings.holdout_fraction or 0.3
            res["estabilidad_prueba_final"] = summaries.holdout_stability(sub, comp, settings, frac, settings.holdout_repeats)
        res["estado"] = "evaluado"
        res["n"] = int(len(sub))
        if "fuente" in sub.columns:
            res["n_por_fuente"] = {k: int(v) for k, v in sub["fuente"].value_counts().items()}
        res["evaluacion"] = "validación cruzada por participante dentro del desarrollo" + (
            " + prueba final en participantes apartados" if test is not None else " (exploratoria: sin prueba final)")
        if test is not None and winner is not None:
            cols = FEATURE_SETS[winner.features]
            Xd, Xt = dev[cols], test[cols]
            okd, okt = Xd.notna().all(axis=1), Xt.notna().all(axis=1)
            model = make_model(winner.model, settings.seed)
            model.fit(Xd[okd], dev.loc[okd, comp.target].to_numpy(float))
            pred = model.predict(Xt[okt])
            fin = metrics(test.loc[okt, comp.target].to_numpy(float), pred)
            bcols = FEATURE_SETS["basica"]
            okbd, okbt = dev[bcols].notna().all(axis=1), test[bcols].notna().all(axis=1)
            base = make_model("lineal", settings.seed).fit(dev.loc[okbd, bcols], dev.loc[okbd, comp.target].to_numpy(float))
            base_fin = metrics(test.loc[okbt, comp.target].to_numpy(float), base.predict(test.loc[okbt, bcols]))
            res["prueba_final"] = {"ganador": {k: round(v, 4) for k, v in fin.items()}, "linea_base": {k: round(v, 4) for k, v in base_fin.items()},
                                   "cumple_criterios": bool(fin["mae"] < base_fin["mae"] and fin["rmse"] < base_fin["rmse"] and fin["r2"] > base_fin["r2"])}
            res["cumple_criterios"] = res["prueba_final"]["cumple_criterios"]
            res["salida_en_la_app"] = "valor continuo" if res["cumple_criterios"] else "Requiere prueba directa"
        if "externa" in set(sub.get("fuente", [])):
            res["advertencia"] = ("El entrenamiento incluye personas de una base pública externa (otra población y otro protocolo). Sirve para probar "
                                  "el programa con datos reales; no valida el estudio ni autoriza publicar estos modelos en la aplicación.")
            res["cumple_criterios_en_la_prueba"] = res["cumple_criterios"]  # lo que dio el modelo; no se publica
            res["cumple_criterios"] = False
            res["salida_en_la_app"] = "Requiere prueba directa"
        if len(sub) < MIN_ROWS_RELIABLE:
            res["advertencia"] = (f"Solo hay {len(sub)} participantes (menos de {MIN_ROWS_RELIABLE}): el entrenamiento se forzó para probar el "
                                  "programa. Estos números no valen como resultado y el componente no puede declararse apto.")
            res["cumple_criterios"] = False
            res["salida_en_la_app"] = "Requiere prueba directa"
        if figures_dir is not None and winner is not None:
            _figures(figures_dir, comp, dev, winner, settings, res)
        results[comp.key] = res
    return results


def _figures(out: Path, comp: Component, dev: pd.DataFrame, winner, settings: EvaluationSettings, res: dict) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out.mkdir(parents=True, exist_ok=True)
    cols = FEATURE_SETS[winner.features]
    ok = dev[cols].notna().all(axis=1).to_numpy()
    X = dev.loc[ok, cols].reset_index(drop=True)
    y = dev.loc[ok, comp.target].to_numpy(float)
    groups = dev.loc[ok, "id_participante"].astype(str).to_numpy()
    # observado frente a estimado
    fig, ax = plt.subplots(figsize=(4.6, 4.2), dpi=150)
    ax.scatter(winner.oof_pred, winner.oof_true, s=18)
    lo, hi = float(min(winner.oof_pred.min(), winner.oof_true.min())), float(max(winner.oof_pred.max(), winner.oof_true.max()))
    ax.plot([lo, hi], [lo, hi], lw=1, ls="--", color="gray")
    ax.set_xlabel(f"Estimado ({comp.unit})"); ax.set_ylabel(f"Observado ({comp.unit})")
    ax.set_title(f"{comp.key}: {winner.model}, entradas {winner.features}", fontsize=9)
    fig.tight_layout(); fig.savefig(out / f"{comp.key}_observado_vs_estimado.png"); plt.close(fig)
    # residuos
    fig, ax = plt.subplots(figsize=(4.6, 3.6), dpi=150)
    ax.scatter(winner.oof_pred, winner.oof_true - winner.oof_pred, s=18)
    ax.axhline(0, color="gray", lw=1)
    ax.set_xlabel(f"Estimado ({comp.unit})"); ax.set_ylabel("Residuo")
    fig.tight_layout(); fig.savefig(out / f"{comp.key}_residuos.png"); plt.close(fig)
    # curva de aprendizaje
    lc = learning_curve(X, y, groups, winner.model, settings.k_folds, settings.seed)
    fig, ax = plt.subplots(figsize=(4.6, 3.6), dpi=150)
    ax.plot([p["fraccion_ajuste"] for p in lc], [p["mae"] for p in lc], marker="o")
    ax.set_xlabel("Fracción de participantes usada para ajustar"); ax.set_ylabel(f"MAE ({comp.unit})")
    fig.tight_layout(); fig.savefig(out / f"{comp.key}_curva_aprendizaje.png"); plt.close(fig)
    res["curva_aprendizaje"] = lc
    # curva de pérdida de XGBoost
    if winner.model == "xgboost":
        lossc = xgboost_loss_curve(X, y, groups, settings.seed)
        if lossc:
            fig, ax = plt.subplots(figsize=(4.6, 3.6), dpi=150)
            ax.plot(lossc["ajuste"], label="ajuste"); ax.plot(lossc["validacion"], label="validación")
            ax.set_xlabel("Iteración"); ax.set_ylabel(f"RMSE ({comp.unit})"); ax.legend()
            fig.tight_layout(); fig.savefig(out / f"{comp.key}_curva_perdida_xgboost.png"); plt.close(fig)
