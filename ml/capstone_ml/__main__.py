"""Uso:  python -m capstone_ml [--dataset RUTA] [--out CARPETA] [--exclude P001 ...] [--holdout 0.3] [--solo-calidad]"""
from __future__ import annotations

import argparse
import sys
from dataclasses import asdict
from pathlib import Path

from .config import DEFAULT_DATASET, DEFAULT_OUTPUT, EvaluationSettings
from .pipeline import run_models, run_quality
from .report import write_all


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Prueba de la base de datos del Capstone y evaluación de modelos por componente.")
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    ap.add_argument("--externo", type=Path, action="append", default=[], help="Base externa de prueba (se puede repetir).")
    ap.add_argument("--exclude", nargs="*", default=[], help="Códigos de participante a excluir por decisión del investigador.")
    ap.add_argument("--holdout", type=float, default=None, help="Fracción de participantes para la prueba final (por defecto, ninguna).")
    ap.add_argument("--repeticiones-prueba", type=int, default=1, help="Repite la prueba final con particiones distintas para medir la estabilidad (usa --holdout, 0.3 si no se indica).")
    ap.add_argument("--min-rows", type=int, default=None)
    ap.add_argument("--folds", type=int, default=None)
    ap.add_argument("--repeats", type=int, default=None)
    ap.add_argument("--solo-calidad", action="store_true", help="Solo el informe de calidad, sin entrenar.")
    a = ap.parse_args(argv)

    s = EvaluationSettings(exclude_ids=list(a.exclude), holdout_fraction=a.holdout)
    s.holdout_repeats = a.repeticiones_prueba
    if a.min_rows is not None:
        s.min_rows_for_modeling = a.min_rows
    if a.folds is not None:
        s.k_folds = a.folds
    if a.repeats is not None:
        s.n_repeats = a.repeats

    if s.min_rows_for_modeling < 30:
        print("AVISO: se bajó el mínimo de filas. Es solo para probar el programa; los resultados no valen y ningún componente saldrá apto.")
    q = run_quality(a.dataset, s, a.externo)
    df, elig = q["_df"], q["_elig"]
    results = None
    if not a.solo_calidad:
        ready = [k for k, v in q["disponibilidad_por_componente"].items() if v["alcanza_para_modelar"]]
        if ready:
            results = run_models(df, elig, s, figures_dir=a.out / "figuras")
        else:
            print(f"Ningún componente alcanza {max(s.min_rows_for_modeling, s.k_folds)} filas utilizables: no se entrena nada.")
    written = write_all(a.out, q, results, asdict(s))
    print(f"Participantes con datos: {q['muestra']['n_filas']}")
    for k, v in q["disponibilidad_por_componente"].items():
        print(f"  {k}: {v['n_disponible']} utilizables" + (f" ({len(v['excluidos'])} excluidos; el motivo de cada uno está en el informe)" if v["excluidos"] else ""))
    print("Archivos:", *[str(p) for p in written], sep="\n  ")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
