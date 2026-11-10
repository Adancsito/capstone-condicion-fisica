"""Genera el protocolo de captura de la app (public/protocols/protocol.json) a partir de la base de datos de sesiones.

La batería, los campos, las unidades y los rangos son configuración: salen del diccionario y de las validaciones de la propia base,
no del código. Si el asesor cambia una prueba, se cambia la base, se vuelve a ejecutar esto y la app genera otro formulario.

Uso:  python -m capstone_ml.export_protocol --out ../public/protocols/protocol.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from openpyxl import load_workbook

from .config import DEFAULT_DATASET, REPEATABILITY_THRESHOLDS

SECTION_IDS = {
    "Identificación": "ident", "Elegibilidad y perfil": "elegib", "Seguridad y reposo": "seguridad", "Antropometría": "antrop",
    "Composición corporal (BIA)": "bia", "Flexibilidad": "flex", "Fuerza de prensión": "grip", "Resistencia del tronco": "trunk",
    "Capacidad cardiorrespiratoria": "cardio", "Cierre de la sesión": "cierre",
}
SECTION_TITLES = {
    "ident": "Identificación", "elegib": "Consentimiento y elegibilidad", "seguridad": "Seguridad y reposo",
    "antrop": "Antropometría (dos lecturas por medida)", "bia": "Composición corporal: bioimpedancia, antes de cualquier esfuerzo",
    "flex": "Flexibilidad: sit-and-reach", "grip": "Fuerza: prensión manual máxima", "trunk": "Resistencia: sostén de los extensores del tronco",
    "cardio": "Capacidad cardiorrespiratoria: caminata de 2 km", "cierre": "Incidentes y cierre",
}
LABELS = {
    "id_participante": "Código del participante", "fecha": "Fecha", "hora_inicio": "Hora de inicio", "evaluador": "Evaluador",
    "consentimiento": "Consentimiento informado firmado", "edad_anios": "Edad (años cumplidos)", "sexo": "Sexo de referencia",
    "dias_entreno_sem": "Días de entrenamiento por semana (últimos 3 meses)", "entrena_competitivo": "¿Entrena fuerza o resistencia de forma competitiva?",
    "elegible": "Elegible según el protocolo (18 a 40 años, sin entrenamiento competitivo, capaz de completar las pruebas)",
    "parq_aplicado": "PAR-Q+ aplicado", "parq_resultado": "Resultado del PAR-Q+", "fc_reposo_lpm": "Frecuencia cardiaca en reposo",
    "fc_dispositivo_reposo": "Dispositivo de frecuencia cardiaca", "criterio_seguridad": "Criterio de seguridad del protocolo para continuar",
    "lado_medido": "Lado medido en brazo, muslo y pantorrilla (siempre el mismo)",
    "bia_realizada": "¿Se realizó la bioimpedancia?", "bia_motivo_no": "Motivo si no se realizó", "bia_pct_grasa": "% de grasa corporal",
    "bia_entradas_registradas": "Entradas del equipo (peso, talla, edad, sexo) registradas", "bia_horas_ultima_comida": "Horas desde la última comida",
    "bia_ejercicio_24h": "Ejercicio en las últimas 24 h", "bia_hidratacion": "Hidratación declarada",
    "sr_realizada": "¿Se realizó el sit-and-reach?", "sr_motivo_no": "Motivo si no se realizó",
    "grip_mano_dominante": "Mano dominante", "grip_mano_evaluada": "Mano evaluada",
    "trunk_realizada": "¿Se realizó el test del tronco?", "trunk_motivo_no": "Motivo si no se realizó", "trunk_tiempo_s": "Tiempo de sostén",
    "trunk_fin": "Terminó por", "cardio_realizada": "¿Se realizó la caminata de 2 km?", "cardio_motivo_no": "Motivo si no se realizó",
    "cardio_fc_dispositivo": "Dispositivo de FC", "c2km_min": "Tiempo de la caminata: minutos", "c2km_seg": "Tiempo de la caminata: segundos",
    "c2km_fc_final_lpm": "FC al terminar", "c2km_troto": "¿Trotó en algún tramo de la caminata de 2 km?",
    "incidentes": "Incidentes o síntomas durante la sesión (escribe «Ninguno» si no hubo)", "observaciones": "Observaciones (equipo distinto, cambios en el protocolo, otros)",
    "datos_faltantes_motivo": "Datos faltantes y motivo", "sesion_completa": "¿Sesión completa?", "equipos_cambio": "Equipo distinto al de la hoja de equipos",
}
for _m, _n in (("peso_kg", "Peso"), ("talla_cm", "Talla"), ("cintura_cm", "Cintura"), ("cadera_cm", "Cadera"), ("brazo_cm", "Circunferencia de brazo"),
               ("muslo_cm", "Circunferencia de muslo"), ("pantorrilla_cm", "Circunferencia de pantorrilla")):
    LABELS[f"{_m}_1"] = f"{_n}: lectura 1"
    LABELS[f"{_m}_2"] = f"{_n}: lectura 2"
for _i in (1, 2, 3):
    LABELS[f"sr_cm_{_i}"] = f"Alcance: intento {_i}"
    LABELS[f"grip_kg_{_i}"] = f"Prensión: intento {_i}"
OPTION_LABELS = {
    "banda": "Banda pectoral", "reloj": "Reloj de muñeca", "D": "Derecha", "I": "Izquierda", "M": "Masculino", "F": "Femenino",
    "fatiga": "Fatiga", "postura": "Pérdida de postura", "tiempo_limite": "Tiempo límite del protocolo", "dolor": "Dolor o síntoma",
    "habitual": "Habitual", "poca": "Poca", "mucha": "Mucha", "Apto": "Apto", "Derivar": "Derivar o no realizar pruebas",
    "Cumple": "Cumple", "No cumple": "No cumple (no continuar)",
}
HELP = {
    "id_participante": "Formato P001 a P120. No escribas nombre ni DNI.",
    "sr_cm_1": "El cero está en la línea de los pies: positivo si pasa de los pies, negativo si no llega.",
    "trunk_tiempo_s": "Cronometra desde que el tronco queda horizontal hasta que baja de la horizontal.",
    "c2km_troto": "Si el participante trota, la prueba UKK no es válida.",
    "bia_pct_grasa": "Se mide antes de cualquier esfuerzo, con la misma balanza para todos.",
}
# Pruebas opcionales: el motivo aparece si no se realizó, y los campos de resultado solo si se realizó.
GATED = {"bia": ("bia_realizada", "bia_motivo_no"), "flex": ("sr_realizada", "sr_motivo_no"),
         "trunk": ("trunk_realizada", "trunk_motivo_no"), "cardio": ("cardio_realizada", "cardio_motivo_no")}


def build(path: Path) -> dict:
    wb = load_workbook(path)
    ws = wb["Registro"]
    header = {c.column_letter: c.value for c in ws[1]}
    order = [c.value for c in ws[1]]
    dv = {}
    for v in ws.data_validations.dataValidation:
        for rng in str(v.sqref).split():
            letters = "".join(ch for ch in rng.split(":")[0] if ch.isalpha())
            dv[header[letters]] = v
    dic = {r[0]: r for r in wb["Diccionario"].iter_rows(min_row=2, values_only=True) if r[0]}

    sections: dict[str, dict] = {}
    for key in order:
        row = dic.get(key)
        if not row or row[1] not in SECTION_IDS:
            continue
        sid = SECTION_IDS[row[1]]
        sec = sections.setdefault(sid, {"id": sid, "title": SECTION_TITLES[sid], "fields": []})
        kind = {"texto": "text", "fecha": "date", "hora": "time", "lista": "select", "número": "number", "entero": "integer"}[row[3]]
        field: dict = {"key": key, "label": LABELS.get(key, row[2]), "type": kind}
        if kind in ("number", "integer"):
            unit = str(row[4])
            field["unit"] = {"años (18 a 40)": "años", "0 a 7": "días", "s (0 a 59)": "s"}.get(unit, unit if len(unit) <= 6 else "")
            v = dv.get(key)
            if v is not None and v.formula1 is not None:
                field["min"] = float(v.formula1)
                if v.formula2 is not None:
                    field["max"] = float(v.formula2)
        if kind == "select":
            raw = dv[key].formula1.strip('"').split(",")
            field["options"] = [{"value": o, "label": OPTION_LABELS.get(o, o)} for o in raw]
        if key in HELP:
            field["help"] = HELP[key]
        if key == "id_participante":
            field["pattern"] = r"^P\d{3}$"
        if kind == "textarea" or key in ("incidentes", "observaciones", "datos_faltantes_motivo", "equipos_cambio"):
            field["type"] = "textarea"
        mandatory = row[7] == "Sí"
        field["required"] = bool(mandatory)
        sec["fields"].append(field)

    # condiciones de las pruebas opcionales
    for sid, (done, why) in GATED.items():
        for f in sections[sid]["fields"]:
            if f["key"] == done:
                f["required"] = True
            elif f["key"] == why:
                f["visibleIf"] = {"key": done, "equals": "No"}
                f["required"] = {"if": {"key": done, "equals": "No"}}
            else:
                f["visibleIf"] = {"key": done, "equals": "Sí"}
                f["required"] = {"if": {"key": done, "equals": "Sí"}}
    # la caminata exige dispositivo y datos solo si se realizó
    for f in sections["cardio"]["fields"]:
        if f["key"] in ("cardio_fc_dispositivo",):
            f["visibleIf"] = {"key": "cardio_realizada", "equals": "Sí"}
            f["required"] = {"if": {"key": "cardio_realizada", "equals": "Sí"}}
    ids = ["ident", "elegib", "seguridad", "antrop", "bia", "flex", "grip", "trunk", "cardio", "cierre"]
    return {
        "protocolId": "capstone-registro-de-sesion",
        "title": "Ficha de registro de sesión",
        "sections": [sections[i] for i in ids],
        "gate": {
            "appliesFromSection": "antrop",
            "requires": [
                {"key": "consentimiento", "equals": "Sí", "message": "Sin consentimiento firmado no se continúa."},
                {"key": "elegible", "equals": "Sí", "message": "El participante no es elegible según el protocolo: no se continúa."},
                {"key": "parq_resultado", "equals": "Apto", "message": "El PAR-Q+ no resultó apto: no se hacen las pruebas de esfuerzo."},
                {"key": "criterio_seguridad", "equals": "Cumple", "message": "El criterio de seguridad no se cumple: no se continúa."},
            ],
        },
        "thresholds": REPEATABILITY_THRESHOLDS,
        "exportColumns": order,
    }


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    proto = build(a.dataset)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(proto, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(len(s["fields"]) for s in proto["sections"])
    print(f"Protocolo: {len(proto['sections'])} secciones, {n} campos, {len(proto['exportColumns'])} columnas de exportación -> {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
