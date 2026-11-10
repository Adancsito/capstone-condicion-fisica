"""Salida legible: informe de calidad de datos y resultados por componente, en Markdown y JSON."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


def _clean(obj):
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items() if not str(k).startswith("_")}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    return obj


def quality_markdown(q: dict) -> str:
    s = q["muestra"]
    lines = ["# Calidad de datos", "", f"Generado: {datetime.now():%Y-%m-%d %H:%M}", f"Base: `{q['archivo']}`", ""]
    lines += [f"**Participantes con datos:** {s['n_filas']} ({', '.join(q['participantes']) or 'ninguno'})", ""]
    if q["ids_duplicados"]:
        lines += [f"**Códigos duplicados:** {', '.join(q['ids_duplicados'])}", ""]
    if s.get("variables"):
        lines += ["## Descripción de la muestra", "", "| Variable | n | Media | Mín. | Máx. |", "|---|---|---|---|---|"]
        for k, v in s["variables"].items():
            lines.append(f"| {k} | {v['n']} | {v['media']} | {v['min']} | {v['max']} |")
        lines += ["", f"Edad (mín., máx.): {s['edad_min_max']}. Sexo: {s['sexo']}.", ""]
    lines += ["## Disponibilidad por componente", "", "| Componente | n utilizable | Alcanza para modelar | Excluidos y motivo |", "|---|---|---|---|"]
    for k, v in q["disponibilidad_por_componente"].items():
        ex = "; ".join(f"{i}: {m}" for i, m in v["excluidos"].items()) or "ninguno"
        lines.append(f"| {k} · {v['nombre']} | {v['n_disponible']} | {'sí' if v['alcanza_para_modelar'] else 'no'} | {ex} |")
    notes = [f"- **{k}:** {v['nota']}" for k, v in q["disponibilidad_por_componente"].items() if v["nota"]]
    if notes:
        lines += ["", *notes]
    lines += ["", "## Campos obligatorios vacíos", ""]
    gaps = q["campos_obligatorios_vacios"]
    lines += [f"- {pid}: {', '.join(g)}" for pid, g in gaps.items()] or ["Ninguno."]
    lines += ["", "## Repetibilidad entre lecturas (diferencia mayor al umbral)", ""]
    rep = q["repetibilidad_fuera_de_umbral"]
    lines += [f"- {r['id_participante']}: {r['medida']} difiere {r['diferencia']:.1f} (umbral {r['umbral']})" for r in rep] or ["Ninguna."]
    lines += ["", "## Valores fuera del rango de plausibilidad de la base", ""]
    oor = q["fuera_de_rango_plausible"]
    lines += [f"- {r['id_participante']}: {r['campo']} = {r['valor']} (rango {r['rango']})" for r in oor] or ["Ninguno."]
    if q["coherencia"]:
        lines += ["", "## Coherencia interna", ""] + [f"- {x}" for x in q["coherencia"]]
    if q["observaciones_registradas"]:
        lines += ["", "## Observaciones escritas en las fichas", ""] + [f"- {k}: {v}" for k, v in q["observaciones_registradas"].items()]
    p = q["parametros_provisionales"]
    lines += ["", "## Parámetros provisionales (pendientes de aprobación del asesor)", "",
              f"- Mínimo de filas para modelar: {p['min_rows_for_modeling']}", f"- Pliegues de validación cruzada: {p['k_folds']}",
              f"- Repeticiones: {p['n_repeats']}", f"- Fracción de prueba final: {p['holdout_fraction']}",
              f"- Participantes excluidos por decisión: {p['exclude_ids'] or 'ninguno'}"]
    return "\n".join(lines) + "\n"


def results_markdown(res: dict, settings: dict) -> str:
    lines = ["# Resultados por componente", "", f"Generado: {datetime.now():%Y-%m-%d %H:%M}", "",
             "**Lectura obligatoria:** con muestras pequeñas la validación es inestable (Riley et al., 2020; Varoquaux, 2018). Estos "
             "números sirven para probar el programa y para una primera idea; no son el resultado final del estudio.", ""]
    for k, r in res.items():
        lines += [f"## {k} · {r['nombre']}", ""]
        if r.get("estado") != "evaluado":
            lines += [f"Estado: **{r['estado']}** (n = {r['n']}). Salida en la aplicación: **{r['salida_en_la_app']}**.", ""]
            continue
        g = r["ganador"]
        if r.get("advertencia"):
            lines += [f"> **ADVERTENCIA:** {r['advertencia']}", ""]
        if r.get("n_por_fuente"):
            lines += [f"Participantes por fuente: {r['n_por_fuente']}.", ""]
        lines += [f"n = {r['n']}. {r['evaluacion']}.", "",
                  f"- Referencia (predecir la media): MAE {r['referencia_media_mae']}",
                  f"- Línea de base (regresión lineal con peso y talla): MAE {r['linea_base_mae']}",
                  f"- Ganador: **{g['modelo']}** con entradas *{g['entradas']}*: MAE {g['mae']}, RMSE {g['rmse']}, R² {g['r2']}, "
                  f"sesgo {g['sesgo']}, calibración (pendiente {g['calibracion_pendiente']}, intercepto {g['calibracion_intercepto']})",
                  f"- Cumple el criterio (MAE y RMSE menores y R² mayor que la línea de base, y MAE menor que la media): **{'sí' if r.get('cumple_criterios_en_la_prueba', r['cumple_criterios']) else 'no'}**"
                  + (" (solo en esta prueba del programa)" if "cumple_criterios_en_la_prueba" in r else ""),
                  f"- Salida en la aplicación: **{r['salida_en_la_app']}**", ""]
        if r.get("porcentajes"):
            pc = r["porcentajes"]
            lines += [f"En porcentajes: el modelo explica **{pc['r2_pct']} %** de la variación (R²); "
                      + (f"el error medio equivale a **{pc['mae_pct_de_la_media']} %** del valor promedio; " if pc['mae_pct_de_la_media'] is not None else "")
                      + f"reduce el error **{pc['mejora_vs_linea_base_pct']} %** frente a la línea de base y **{pc['mejora_vs_media_pct']} %** frente a predecir la media.", ""]
        if r.get("por_sexo"):
            lines += ["Dentro de cada sexo (predicciones fuera de muestra):", "", "| Sexo | n | MAE | R² | Media observada |", "|---|---|---|---|---|"]
            lines += [f"| {s} | {v['n']} | {v['mae']} | {v['r2']} | {v['media_observada']} |" for s, v in r["por_sexo"].items()]
            lines += ["", "Si el R² dentro de cada sexo es mucho menor que el global, buena parte de la capacidad del modelo viene solo de distinguir hombres de mujeres.", ""]
        if r.get("estabilidad_prueba_final"):
            e = r["estabilidad_prueba_final"]
            lines += [f"Estabilidad ({e['particiones']} particiones distintas, {int(e['fraccion_de_prueba']*100)} % de los participantes como prueba final, ~{e['n_test_medio']} personas cada vez):", "",
                      f"- MAE de prueba: {e['mae_media']} ± {e['mae_sd']} (mín. {e['mae_min_max'][0]}, máx. {e['mae_min_max'][1]}); R² {e['r2_media']} ± {e['r2_sd']}",
                      f"- Línea de base: MAE {e['base_mae_media']}; predecir la media: MAE {e['media_mae_media']}",
                      f"- Particiones donde el modelo supera a la línea de base: **{int(e['pct_particiones_que_superan_la_base'])} %**; a la media: **{int(e['pct_particiones_que_superan_la_media'])} %**",
                      f"- Modelos elegidos: {e['modelos_elegidos']}", ""]
        if "prueba_final" in r:
            pf = r["prueba_final"]
            lines += [f"Prueba final: ganador MAE {pf['ganador']['mae']} frente a línea de base {pf['linea_base']['mae']}.", ""]
        lines += ["| Modelo | Entradas | MAE | RMSE | R² | Sesgo | MAE (sd entre repeticiones) |", "|---|---|---|---|---|---|---|"]
        for t in r["tabla"]:
            lines.append(f"| {t['modelo']} | {t['entradas']} | {t['mae']} | {t['rmse']} | {t['r2']} | {t['sesgo']} | {t['mae_sd']} |")
        lines.append("")
    return "\n".join(lines) + "\n"


def write_all(out_dir: Path, quality: dict, results: dict | None, settings: dict) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    (out_dir / "calidad_datos.md").write_text(quality_markdown(quality), encoding="utf-8"); written.append(out_dir / "calidad_datos.md")
    (out_dir / "calidad_datos.json").write_text(json.dumps(_clean(quality), ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    written.append(out_dir / "calidad_datos.json")
    if results is not None:
        (out_dir / "resultados.md").write_text(results_markdown(results, settings), encoding="utf-8"); written.append(out_dir / "resultados.md")
        (out_dir / "resultados.json").write_text(json.dumps(_clean(results), ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        written.append(out_dir / "resultados.json")
    return written
