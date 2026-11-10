"""Convierte el conjunto público de Třebický et al. (2026) al formato de la base de sesiones, SOLO con lo que esa fuente midió.

Fuente: Třebický V, et al. (2026). A multi-domain physical fitness dataset of Central European adults. Sci Data 13: 776.
Datos: OSF, DOI 10.17605/OSF.IO/EFD2M, licencia CC BY 4.0. N = 128 adultos de 18 a 40 años. Uso no comercial, sin intentar identificar a nadie.

Reglas del convertidor (ninguna inventa un dato):
- Se usan los datos reales tal como están; lo que la fuente no midió queda vacío.
- No se arrastran las iniciales de las personas: el código es E001… y la referencia a la fuente es solo número y sexo (p. ej. 01F).
- Una sola lectura por medida (la fuente no repitió las circunferencias): se llena la lectura 1 y la 2 queda vacía.
- Brazo, muslo y pantorrilla: lado derecho (la ficha propia también registra un solo lado).
- Peso: el de la balanza de bioimpedancia (Tanita MC-980), por eso falta en las mismas personas que el % de grasa.
- Sit-and-reach: la fuente pone el cero en el borde de la caja y 15 cm en la línea de los pies; la ficha propia pone el cero en los pies,
  así que valor propio = valor de la fuente − 15 cm.
- Prensión: mano derecha, tres intentos, en kg (así figura en el diccionario de la fuente).
- Tronco y caminata de 2 km: la fuente no los midió. Su VO2máx en cinta con analizador de gases es otra prueba y se guarda aparte.

Uso:  python -m capstone_ml.external_osf --src <carpeta con los dos .xlsx> --out <archivo .xlsx>
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SOURCE = "OSF efd2m, Třebický et al. 2026 (CC BY 4.0)"
SR_OFFSET_CM = 15.0


def _key(raw) -> str | None:
    m = re.match(r"^\s*0*(\d+)\s*([FMfm])", str(raw))
    return f"{int(m.group(1)):02d}{m.group(2).upper()}" if m else None


def _load(x: pd.ExcelFile, sheet: str, survey_sex: dict[str, str] | None = None) -> pd.DataFrame:
    df = x.parse(sheet)
    df["_key"] = [_key(i) for i in df["ID"]]
    df = df.drop(columns=["ID"])
    return df


def convert(src: Path) -> tuple[pd.DataFrame, list[str]]:
    notes: list[str] = []
    x = pd.ExcelFile(src / "Dataset_physical-fitness.xlsx")

    sv = x.parse("Survey")
    sv["_key"] = [_key(i) for i in sv["ID"]]
    # en la hoja Survey un código perdió la letra de sexo (09_MB); se recupera de la columna Sexo
    for i, k in enumerate(sv["_key"]):
        if pd.isna(k):
            digits = re.match(r"^\s*0*(\d+)", str(sv.loc[i, "ID"]))
            letter = "F" if sv.loc[i, "Sex"] == "woman" else "M"
            sv.loc[i, "_key"] = f"{int(digits.group(1)):02d}{letter}"
            notes.append("Survey: un código sin letra de sexo se completó con la columna Sexo de la propia hoja.")
    an = _load(x, "Anthropometry")
    bc = _load(x, "Body composition")
    fl = _load(x, "Flexibility")
    hg = _load(x, "Handgrip")
    vo = _load(x, "VO2max")

    # Body composition trae dos filas con el mismo código (61M); una está vacía y corresponde a la persona que falta (61F)
    dup = bc[bc["_key"].duplicated(keep=False)]
    if len(dup):
        notes.append(f"Body composition: código duplicado {sorted(set(dup['_key']))}; se conserva la fila con datos y la otra queda como dato faltante.")
        bc = bc.sort_values("Body weight", na_position="last").drop_duplicates("_key", keep="first")

    out = sv[["_key", "Age (yrs)", "Sex", "Physical activity type", "Hours of practice (hrs)"]].copy()
    for df, cols in ((an, ["Body height (cm)", "Waist (cm)", "Hips (cm)", "Right thigh (cm)", "Right calf (cm)", "Right upper arm (cm)"]),
                     (bc, ["Body weight", "Fat  %"]), (fl, ["Sit and reach test"]),
                     (hg, ["Right hand #1", "Right hand #2", "Right hand #3"]), (vo, ["V'O2 per kg (ml per min per kg)"])):
        out = out.merge(df[["_key"] + cols], on="_key", how="left")
    if len(out) != 128:
        raise ValueError(f"Se esperaban 128 personas y hay {len(out)}.")
    out["_n"] = out["_key"].str[:2].astype(int)
    out = out.sort_values(["_n", "_key"]).reset_index(drop=True)

    rows = pd.DataFrame({
        "id_participante": [f"E{i:03d}" for i in range(1, len(out) + 1)],
        "fuente": "externa",
        "id_fuente": out["_key"],
        "edad_anios": out["Age (yrs)"],
        "sexo": out["Sex"].map({"woman": "F", "man": "M"}),
        "peso_kg_1": out["Body weight"],
        "talla_cm_1": out["Body height (cm)"],
        "cintura_cm_1": out["Waist (cm)"],
        "cadera_cm_1": out["Hips (cm)"],
        "brazo_cm_1": out["Right upper arm (cm)"],
        "muslo_cm_1": out["Right thigh (cm)"],
        "pantorrilla_cm_1": out["Right calf (cm)"],
        "lado_medido": "D",
        "bia_realizada": np.where(out["Fat  %"].notna(), "Sí", "No"),
        "bia_motivo_no": np.where(out["Fat  %"].notna(), None, "Sin dato en la fuente"),
        "bia_pct_grasa": out["Fat  %"],
        "sr_realizada": "Sí",
        "sr_cm_1": out["Sit and reach test"] - SR_OFFSET_CM,
        "grip_mano_evaluada": "D",
        "grip_kg_1": out["Right hand #1"], "grip_kg_2": out["Right hand #2"], "grip_kg_3": out["Right hand #3"],
        "trunk_realizada": "No", "trunk_motivo_no": "No medido en la fuente",
        "cardio_realizada": "No", "cardio_motivo_no": "La fuente midió VO2máx en cinta, no la caminata de 2 km",
        "vo2max_ml_kg_min_fuente": out["V'O2 per kg (ml per min per kg)"],
        "actividad_fisica_fuente": out["Physical activity type"],
        "horas_practica_semana_fuente": out["Hours of practice (hrs)"],
        "observaciones": "Dato público. Una sola lectura por medida; lado derecho; sit-and-reach = valor de la fuente − 15 cm.",
    })
    return rows, sorted(set(notes))


def checks(rows: pd.DataFrame) -> list[str]:
    limits = {"peso_kg_1": (30, 250), "talla_cm_1": (120, 230), "cintura_cm_1": (40, 200), "cadera_cm_1": (50, 200), "brazo_cm_1": (15, 60),
              "muslo_cm_1": (30, 100), "pantorrilla_cm_1": (20, 70), "bia_pct_grasa": (3, 60), "grip_kg_1": (0, 120), "sr_cm_1": (-30, 60),
              "edad_anios": (18, 40)}
    out = []
    for col, (lo, hi) in limits.items():
        bad = rows[(rows[col].notna()) & ((rows[col] < lo) | (rows[col] > hi))]
        if len(bad):
            out.append(f"{col}: {len(bad)} valores fuera del rango de plausibilidad de la base ({lo} a {hi})")
    return out


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    rows, notes = convert(a.src)
    issues = checks(rows)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    readme = pd.DataFrame({"Leeme": [
        "BASE EXTERNA DE PRUEBA (no son participantes del estudio)",
        f"Fuente: {SOURCE}. N = 128 adultos de 18 a 40 años. DOI de los datos: 10.17605/OSF.IO/EFD2M.",
        "Licencia CC BY 4.0. Uso no comercial y sin intentar identificar a nadie; se cita la fuente en cualquier uso.",
        "Sirve para probar que el programa de análisis y los modelos funcionan con datos reales. No se mezcla con la base propia (100 participantes) ni se presenta como resultado del estudio.",
        "Solo trae lo que la fuente midió: peso, talla, cintura, cadera, brazo, muslo, pantorrilla, % de grasa (Tanita MC-980), sit-and-reach y prensión.",
        "No trae resistencia del tronco ni la caminata de 2 km; tampoco consentimiento, PAR-Q+, frecuencia cardiaca ni equipos de nuestro protocolo. Esos campos quedan vacíos y no se rellenan.",
        "Una sola lectura por medida, lado derecho. Peso de la balanza de bioimpedancia (faltan 9 personas en peso y grasa). Sit-and-reach = valor de la fuente − 15 cm (el cero de la fuente está en el borde de la caja). Prensión en kg.",
        "Sin las iniciales de las personas: la referencia a la fuente (id_fuente) es solo número y sexo.",
        *[f"Aviso de conversión: {n}" for n in notes],
    ]})
    with pd.ExcelWriter(a.out, engine="openpyxl") as w:
        readme.to_excel(w, sheet_name="Leeme", index=False)
        rows.to_excel(w, sheet_name="Registro", index=False)
        w.sheets["Leeme"].column_dimensions["A"].width = 160
    print(f"{len(rows)} personas -> {a.out}")
    print("Con grasa:", int(rows["bia_pct_grasa"].notna().sum()), "| con peso:", int(rows["peso_kg_1"].notna().sum()), "| con prensión:", int(rows["grip_kg_1"].notna().sum()),
          "| con sit-and-reach:", int(rows["sr_cm_1"].notna().sum()))
    for n in notes + issues:
        print(" -", n)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
