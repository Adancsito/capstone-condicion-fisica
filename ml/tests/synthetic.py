"""DATOS SINTÉTICOS SOLO PARA PROBAR EL CÓDIGO.

No representan a ninguna persona ni sirven para estimar nada: existen únicamente para comprobar que el programa lee la base,
aplica las reglas y entrena sin errores. Jamás deben mezclarse con la base real ni citarse como resultado.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


def make_sessions(n: int = 60, seed: int = 1) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    peso = rng.normal(72, 12, n).clip(45, 120)
    talla = rng.normal(167, 9, n).clip(145, 195)
    cintura = 0.55 * peso + rng.normal(45, 4, n)
    cadera = 0.40 * peso + rng.normal(65, 4, n)
    brazo = 0.20 * peso + rng.normal(20, 2, n)
    muslo = 0.30 * peso + rng.normal(35, 3, n)
    pant = 0.15 * peso + rng.normal(28, 2, n)
    edad = rng.integers(20, 40, n)
    sexo = rng.choice(["M", "F"], n)
    d = pd.DataFrame({
        "id_participante": [f"S{i:03d}" for i in range(1, n + 1)],
        "fecha": pd.Timestamp("2026-10-01"), "evaluador": "prueba", "consentimiento": "Sí", "edad_anios": edad, "sexo": sexo,
        "dias_entreno_sem": 1, "entrena_competitivo": "No", "elegible": "Sí", "parq_aplicado": "Sí", "parq_resultado": "Apto",
        "fc_reposo_lpm": 70, "fc_dispositivo_reposo": "reloj", "criterio_seguridad": "Cumple", "lado_medido": "D", "sesion_completa": "Sí",
        "bia_realizada": "Sí", "bia_horas_ultima_comida": 3, "bia_hidratacion": "habitual",
        "sr_realizada": "Sí", "grip_mano_dominante": "D", "grip_mano_evaluada": "D", "trunk_realizada": "Sí", "trunk_fin": "fatiga",
        "cardio_realizada": "Sí", "cardio_fc_dispositivo": "reloj", "c2km_troto": "No", "c2km_fc_final_lpm": 140,
    })
    for name, base in (("peso_kg", peso), ("talla_cm", talla), ("cintura_cm", cintura), ("cadera_cm", cadera),
                       ("brazo_cm", brazo), ("muslo_cm", muslo), ("pantorrilla_cm", pant)):
        d[f"{name}_1"] = np.round(base, 1)
        d[f"{name}_2"] = np.round(base + rng.normal(0, 0.1, n), 1)
    imc = peso / (talla / 100) ** 2
    d["bia_pct_grasa"] = np.round(8 + 1.1 * imc + 6 * (sexo == "F") + rng.normal(0, 2, n), 1)
    grip = 18 + 0.25 * peso + 9 * (sexo == "M") + rng.normal(0, 3, n)
    for i in (1, 2, 3):
        d[f"grip_kg_{i}"] = np.round(grip + rng.normal(0, 1, n), 1)
    d["trunk_tiempo_s"] = np.round(rng.normal(55, 12, n).clip(10), 0)
    for i in (1, 2, 3):
        d[f"sr_cm_{i}"] = np.round(rng.normal(-3, 7, n), 1)
    tiempo = 1000 + 3 * (peso - 72) + rng.normal(0, 40, n)
    d["c2km_min"] = (tiempo // 60).astype(int)
    d["c2km_seg"] = (tiempo % 60).astype(int)
    return d


def write_workbook(df: pd.DataFrame, path: Path) -> Path:
    with pd.ExcelWriter(path, engine="openpyxl") as w:
        df.to_excel(w, sheet_name="Registro", index=False)
    return path
