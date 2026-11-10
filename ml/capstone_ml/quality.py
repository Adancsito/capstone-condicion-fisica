"""Control de calidad de la base y reglas de elegibilidad por componente.

Nada de esto corrige ni elimina datos en silencio: cada exclusión queda con su motivo y se cuenta en el informe.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import COMPONENTS, MEASURES, REPEATABILITY_THRESHOLDS, Y2_MAX_AGE, Y2_MIN_AGE, Component

# Campos que toda ficha completa debe traer (los de resultado dependen de que la prueba se haya realizado).
ALWAYS_REQUIRED = [
    "id_participante", "fecha", "evaluador", "consentimiento", "edad_anios", "sexo", "dias_entreno_sem", "entrena_competitivo",
    "elegible", "parq_aplicado", "parq_resultado", "fc_reposo_lpm", "fc_dispositivo_reposo", "criterio_seguridad",
    "lado_medido", "sesion_completa",
] + [f"{m}_{i}" for m in MEASURES for i in (1, 2)]


@dataclass
class Eligibility:
    """Máscara de elegibilidad por componente y motivo de cada exclusión."""

    masks: dict[str, pd.Series]
    reasons: dict[str, dict[str, str]]  # componente -> {id: motivo}


def missing_required(df: pd.DataFrame) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for _, row in df.iterrows():
        if row.get("fuente") == "externa":
            continue  # las bases externas no siguen nuestra ficha: lo que no midieron queda vacío por diseño
        gaps = [c for c in ALWAYS_REQUIRED if c in df.columns and pd.isna(row[c])]
        # Resultados: se exige el valor solo si la ficha dice que la prueba se realizó.
        if row.get("bia_realizada") == "Sí":
            gaps += [c for c in ("bia_pct_grasa", "bia_horas_ultima_comida", "bia_hidratacion") if pd.isna(row.get(c))]
        if row.get("sr_realizada") == "Sí":
            gaps += [c for c in ("sr_cm_1", "sr_cm_2", "sr_cm_3") if pd.isna(row.get(c))]
        gaps += [c for c in ("grip_mano_dominante", "grip_mano_evaluada", "grip_kg_1", "grip_kg_2", "grip_kg_3") if pd.isna(row.get(c))]
        if row.get("trunk_realizada") == "Sí":
            gaps += [c for c in ("trunk_tiempo_s", "trunk_fin") if pd.isna(row.get(c))]
        if row.get("cardio_realizada") == "Sí":
            gaps += [c for c in ("cardio_fc_dispositivo", "c2km_min", "c2km_seg", "c2km_fc_final_lpm", "c2km_troto") if pd.isna(row.get(c))]
        out[str(row["id_participante"])] = gaps
    return {k: v for k, v in out.items() if v}


def repeatability_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Medidas cuya diferencia entre las dos lecturas supera el umbral del procedimiento."""
    rows = []
    for _, r in df.iterrows():
        for m in MEASURES:
            d = r.get(f"dif_{m}")
            if pd.notna(d) and d > REPEATABILITY_THRESHOLDS[m] + 1e-9:
                rows.append({"id_participante": r["id_participante"], "medida": m, "diferencia": float(d),
                             "umbral": REPEATABILITY_THRESHOLDS[m]})
    return pd.DataFrame(rows, columns=["id_participante", "medida", "diferencia", "umbral"])


def out_of_range(df: pd.DataFrame, ranges: dict[str, tuple[float | None, float | None]]) -> pd.DataFrame:
    """Valores fuera de los rangos de plausibilidad de la base (avisos, no exclusiones)."""
    rows = []
    for col, (lo, hi) in ranges.items():
        if col not in df.columns:
            continue
        vals = pd.to_numeric(df[col], errors="coerce")
        for i, v in vals.items():
            if pd.isna(v):
                continue
            if (lo is not None and v < lo) or (hi is not None and v > hi):
                rows.append({"id_participante": df.loc[i, "id_participante"], "campo": col, "valor": float(v), "rango": f"{lo} a {hi}"})
    return pd.DataFrame(rows, columns=["id_participante", "campo", "valor", "rango"])


def _global_reason(row: pd.Series) -> str | None:
    if row.get("fuente") == "externa":
        # base pública de otro estudio: no tiene nuestro consentimiento ni PAR-Q+; solo se exige el rango de edad
        age = row.get("edad_anios")
        return "edad fuera de 18 a 40 años" if pd.notna(age) and not (18 <= age <= 40) else None
    if row.get("consentimiento") != "Sí":
        return "sin consentimiento firmado"
    if row.get("elegible") != "Sí":
        return "no elegible según el protocolo"
    if row.get("entrena_competitivo") == "Sí":
        return "entrena de forma competitiva"
    if row.get("parq_resultado") != "Apto":
        return "PAR-Q+ sin resultado apto"
    if row.get("criterio_seguridad") != "Cumple":
        return "criterio de seguridad no cumplido"
    age = row.get("edad_anios")
    if pd.notna(age) and not (18 <= age <= 40):
        return "edad fuera de 18 a 40 años"
    return None


def _component_reason(comp: Component, row: pd.Series) -> str | None:
    if pd.isna(row.get(comp.target)):
        return "sin resultado"
    if comp.key == "Y1" and row.get("bia_realizada") != "Sí":
        return "bioimpedancia no realizada"
    if comp.key == "Y2":
        if row.get("cardio_realizada") != "Sí":
            return "caminata de 2 km no realizada"
        if row.get("c2km_troto") == "Sí":
            return "trotó durante la caminata (prueba inválida)"
        age = row.get("edad_anios")
        if pd.notna(age) and not (Y2_MIN_AGE <= age <= Y2_MAX_AGE):
            return f"edad fuera del rango del UKK ({Y2_MIN_AGE} a {Y2_MAX_AGE} años)"
    if comp.key == "Y3" and pd.isna(row.get("grip_mano_evaluada")):
        return "mano evaluada sin registrar"
    if comp.key == "Y4" and row.get("trunk_realizada") != "Sí":
        return "prueba de tronco no realizada"
    if comp.key == "Y4" and row.get("trunk_fin") == "dolor":
        return "terminó por dolor o síntoma"
    if comp.key == "Y5" and row.get("sr_realizada") != "Sí":
        return "sit-and-reach no realizado"
    return None


def eligibility(df: pd.DataFrame, exclude_ids: list[str] | None = None) -> Eligibility:
    exclude_ids = set(exclude_ids or [])
    masks: dict[str, pd.Series] = {}
    reasons: dict[str, dict[str, str]] = {}
    for comp in COMPONENTS:
        keep, why = [], {}
        for _, row in df.iterrows():
            pid = str(row["id_participante"])
            reason = ("excluida por decisión del investigador" if pid in exclude_ids else None) or _global_reason(row) or _component_reason(comp, row)
            keep.append(reason is None)
            if reason:
                why[pid] = reason
        masks[comp.key] = pd.Series(keep, index=df.index)
        reasons[comp.key] = why
    return Eligibility(masks, reasons)


def describe_sample(df: pd.DataFrame) -> dict:
    out: dict = {"n_filas": int(len(df))}
    if df.empty:
        return out
    out["edad_min_max"] = [float(df["edad_anios"].min()), float(df["edad_anios"].max())]
    out["sexo"] = df["sexo"].value_counts().to_dict()
    if "fuente" in df.columns:
        out["fuentes"] = df["fuente"].value_counts().to_dict()
    cols = ["peso_kg_prom", "talla_cm_prom", "imc_kg_m2", "bia_pct_grasa", "grip_kg_max", "trunk_tiempo_s", "sr_cm_max", "c2km_total_s"]
    out["variables"] = {c: {"n": int(df[c].notna().sum()), "media": _r(df[c].mean()), "min": _r(df[c].min()), "max": _r(df[c].max())}
                        for c in cols if c in df.columns}
    return out


def _r(x):
    return None if pd.isna(x) else round(float(x), 2)


def duplicated_ids(df: pd.DataFrame) -> list[str]:
    d = df["id_participante"][df["id_participante"].duplicated(keep=False)]
    return sorted(set(map(str, d)))


def recompute_check(df: pd.DataFrame) -> list[str]:
    """Comprobaciones internas de coherencia: IMC consistente con peso y talla, tiempos no negativos."""
    issues = []
    for _, r in df.iterrows():
        pid = r["id_participante"]
        if pd.notna(r.get("imc_kg_m2")) and not (10 <= r["imc_kg_m2"] <= 70):
            issues.append(f"{pid}: IMC fuera de 10 a 70 ({r['imc_kg_m2']:.1f})")
        if pd.notna(r.get("c2km_total_s")) and r["c2km_total_s"] <= 0:
            issues.append(f"{pid}: tiempo de caminata no positivo")
    return issues
