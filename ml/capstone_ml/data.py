"""Lectura de la base de sesiones y cálculo de las variables derivadas.

La hoja Registro trae fórmulas de Excel. Si el archivo se guardó sin abrirlo en Excel, esas celdas no tienen valor
guardado; por eso todo lo derivado se recalcula aquí a partir de los campos de entrada.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from openpyxl import load_workbook

from .config import MEASURES, SHEET

CALCULATED_COLUMNS = [
    "peso_kg_prom", "talla_cm_prom", "cintura_cm_prom", "cadera_cm_prom", "brazo_cm_prom", "muslo_cm_prom", "pantorrilla_cm_prom",
    "dif_peso_kg", "dif_talla_cm", "dif_cintura_cm", "dif_cadera_cm", "dif_brazo_cm", "dif_muslo_cm", "dif_pantorrilla_cm",
    "imc_kg_m2", "grip_kg_max", "sr_cm_max", "c2km_total_s",
]


def load_sessions(path: str | Path) -> pd.DataFrame:
    """Lee la hoja Registro y devuelve solo las filas con datos, con las columnas derivadas ya calculadas."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"No existe la base de datos: {path}")
    if path.suffix.lower() == ".csv":  # exportación de la app (modo Investigador)
        raw = pd.read_csv(path, encoding="utf-8-sig")
    else:
        raw = pd.read_excel(path, sheet_name=SHEET, engine="openpyxl")
    raw = raw.drop(columns=[c for c in CALCULATED_COLUMNS if c in raw.columns])
    for col in raw.columns:
        if pd.api.types.is_object_dtype(raw[col]) or pd.api.types.is_string_dtype(raw[col]):
            raw[col] = raw[col].map(lambda v: v.strip() if isinstance(v, str) else v)
            raw[col] = raw[col].replace({"": np.nan})
    inputs = [c for c in raw.columns if c != "id_participante"]
    has_data = raw[inputs].notna().any(axis=1)
    df = raw.loc[has_data].reset_index(drop=True)
    if "fuente" not in df.columns:
        df["fuente"] = "propia"
    df["fuente"] = df["fuente"].fillna("propia")
    return add_derived(df)


def add_derived(df: pd.DataFrame) -> pd.DataFrame:
    """Promedios, diferencias, IMC, mejores intentos y tiempo total, igual que las fórmulas de la hoja."""
    df = df.copy()
    # una base externa puede no traer todos los campos de la ficha: lo que falta queda vacío, no se inventa
    needed = [f"{m}_{i}" for m in MEASURES for i in (1, 2)] + [f"grip_kg_{i}" for i in (1, 2, 3)] + [f"sr_cm_{i}" for i in (1, 2, 3)]         + ["c2km_min", "c2km_seg", "sexo"]
    for col in needed:
        if col not in df.columns:
            df[col] = np.nan
    for m in MEASURES:  # peso_kg, talla_cm, cintura_cm...
        a, b = f"{m}_1", f"{m}_2"
        if a in df.columns and b in df.columns:
            pair = df[[a, b]].apply(pd.to_numeric, errors="coerce")
            df[f"{m}_prom"] = pair.mean(axis=1, skipna=True)
            df[f"dif_{m}"] = (pair[a] - pair[b]).abs()
    df["imc_kg_m2"] = df["peso_kg_prom"] / (df["talla_cm_prom"] / 100.0) ** 2
    df["grip_kg_max"] = df[["grip_kg_1", "grip_kg_2", "grip_kg_3"]].apply(pd.to_numeric, errors="coerce").max(axis=1, skipna=True)
    df["sr_cm_max"] = df[["sr_cm_1", "sr_cm_2", "sr_cm_3"]].apply(pd.to_numeric, errors="coerce").max(axis=1, skipna=True)
    mins = pd.to_numeric(df["c2km_min"], errors="coerce")
    segs = pd.to_numeric(df["c2km_seg"], errors="coerce")
    df["c2km_total_s"] = mins * 60 + segs
    df["sexo_f"] = df["sexo"].map({"F": 1.0, "M": 0.0})
    return df


def read_validation_ranges(path: str | Path) -> dict[str, tuple[float | None, float | None]]:
    """Rangos de plausibilidad que la propia base define como validación de datos (avisos, no criterios de exclusión)."""
    wb = load_workbook(path)
    ws = wb[SHEET]
    header = {c.column_letter: c.value for c in ws[1]}
    out: dict[str, tuple[float | None, float | None]] = {}
    for dv in ws.data_validations.dataValidation:
        if dv.type not in ("decimal", "whole"):
            continue
        for rng in str(dv.sqref).split():
            letters = "".join(ch for ch in rng.split(":")[0] if ch.isalpha())
            name = header.get(letters)
            if not name:
                continue

            def num(x):
                try:
                    return float(x)
                except (TypeError, ValueError):
                    return None

            lo, hi = num(dv.formula1), num(dv.formula2)
            if dv.operator in ("greaterThanOrEqual", "greaterThan") and dv.formula2 is None:
                hi = None
            out[name] = (lo, hi)
    return out


def load_many(own: str | Path, external: list[str | Path] | None = None) -> pd.DataFrame:
    """Base propia más, si se indican, bases externas de prueba (columna `fuente` = externa). Nunca se mezclan sin dejar constancia."""
    frames = [load_sessions(own)]
    for path in external or []:
        ext = load_sessions(path)
        ext["fuente"] = "externa"
        frames.append(ext)
    return pd.concat(frames, ignore_index=True, sort=False) if len(frames) > 1 else frames[0]
