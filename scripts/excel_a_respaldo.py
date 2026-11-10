"""Convierte la hoja Registro de la base de datos en un respaldo JSON que la aplicación puede importar (Investigador > Importar respaldo).

Uso:  python scripts/excel_a_respaldo.py <Base_de_datos_sesiones.xlsx> <salida.json>
Solo se pasan los campos de entrada del protocolo (public/protocols/protocol.json); los calculados los recalcula la aplicación.
"""
import datetime as dt
import json
import sys
from pathlib import Path

from openpyxl import load_workbook

root = Path(__file__).resolve().parent.parent
protocol = json.loads((root / "public" / "protocols" / "protocol.json").read_text(encoding="utf-8"))
fields = {f["key"]: f for s in protocol["sections"] for f in s["fields"]}


def convert(value, spec):
    if value is None or value == "":
        return None
    t = spec["type"]
    if t == "date":
        return value.strftime("%Y-%m-%d") if isinstance(value, (dt.date, dt.datetime)) else str(value)
    if t == "time":
        return value.strftime("%H:%M") if isinstance(value, (dt.time, dt.datetime)) else str(value)
    if t == "integer":
        return int(value)
    if t == "number":
        v = float(value)
        return int(v) if v == int(v) else v
    return str(value).strip()


def main(src, dst):
    ws = load_workbook(src, data_only=False)["Registro"]
    header = {c.value: c.column for c in ws[1]}
    out = []
    for r in range(2, ws.max_row + 1):
        code = ws.cell(r, header["id_participante"]).value
        if not code or ws.cell(r, header["edad_anios"]).value in (None, ""):
            continue
        values = {k: convert(ws.cell(r, header[k]).value, spec) for k, spec in fields.items() if k in header}
        complete = values.get("sesion_completa") == "Sí"
        out.append({"id": str(code), "status": "completa" if complete else "borrador", "values": values})
    Path(dst).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out)} sesiones -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
