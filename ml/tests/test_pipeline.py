"""Pruebas del programa. Usan datos sintéticos (ver synthetic.py): comprueban el código, no estiman nada."""
import numpy as np
import pandas as pd
import pytest

from capstone_ml import quality
from capstone_ml.config import COMPONENTS, EvaluationSettings
from capstone_ml.data import add_derived, load_sessions
from capstone_ml.modeling import holdout_split, metrics, participant_folds
from capstone_ml.pipeline import run_models, run_quality

from .synthetic import make_sessions, write_workbook


@pytest.fixture()
def book(tmp_path):
    return write_workbook(make_sessions(60), tmp_path / "base.xlsx")


def test_derived_values_match_the_excel_formulas(book):
    df = load_sessions(book)
    row = df.iloc[0]
    assert row["peso_kg_prom"] == pytest.approx((row["peso_kg_1"] + row["peso_kg_2"]) / 2)
    assert row["imc_kg_m2"] == pytest.approx(row["peso_kg_prom"] / (row["talla_cm_prom"] / 100) ** 2)
    assert row["grip_kg_max"] == max(row["grip_kg_1"], row["grip_kg_2"], row["grip_kg_3"])
    assert row["c2km_total_s"] == row["c2km_min"] * 60 + row["c2km_seg"]
    assert set(df["sexo_f"].unique()) <= {0.0, 1.0}


def test_empty_rows_are_ignored(tmp_path):
    d = make_sessions(5)
    extra = pd.DataFrame({"id_participante": ["S900", "S901"]})
    write_workbook(pd.concat([d, extra], ignore_index=True), tmp_path / "b.xlsx")
    assert len(load_sessions(tmp_path / "b.xlsx")) == 5


def test_one_measure_missing_still_averages_the_other():
    df = add_derived(pd.DataFrame({"id_participante": ["A"], "sexo": ["F"], "peso_kg_1": [70.0], "peso_kg_2": [np.nan], "talla_cm_1": [170.0],
                                   "talla_cm_2": [170.0], "grip_kg_1": [30.0], "grip_kg_2": [np.nan], "grip_kg_3": [np.nan],
                                   "sr_cm_1": [-2.0], "sr_cm_2": [np.nan], "sr_cm_3": [np.nan], "c2km_min": [18], "c2km_seg": [30]}))
    assert df.loc[0, "peso_kg_prom"] == 70.0
    assert np.isnan(df.loc[0, "dif_peso_kg"])


def test_repeatability_flags_use_the_thresholds():
    df = pd.DataFrame({"id_participante": ["A", "B"], "dif_peso_kg": [0.2, 0.3], "dif_talla_cm": [0.5, 0.6], "dif_cintura_cm": [1.0, 1.5]})
    flags = quality.repeatability_flags(df)
    assert set(zip(flags["id_participante"], flags["medida"])) == {("B", "peso_kg"), ("B", "talla_cm"), ("B", "cintura_cm")}


def test_eligibility_rules(book):
    d = make_sessions(10)
    d.loc[0, "parq_resultado"] = "Derivar"
    d.loc[1, "c2km_troto"] = "Sí"
    d.loc[2, "edad_anios"] = 19
    d.loc[3, "trunk_fin"] = "dolor"
    d.loc[4, "bia_realizada"] = "No"
    d.loc[4, "bia_pct_grasa"] = np.nan
    df = add_derived(d)
    e = quality.eligibility(df, exclude_ids=["S006"])
    assert not e.masks["Y3"][0] and "PAR-Q+" in e.reasons["Y3"]["S001"]          # no apto: fuera de todo
    assert not e.masks["Y2"][1] and "trotó" in e.reasons["Y2"]["S002"]           # trotó: solo Y2
    assert e.masks["Y3"][1]
    assert e.masks["Y2"][2] and e.masks["Y3"][2]                                  # 19 años: dentro del estudio (18 a 40), también en Y2
    assert not e.masks["Y4"][3] and e.masks["Y3"][3]                              # dolor: solo Y4
    assert not e.masks["Y1"][4] and e.masks["Y3"][4]
    assert not any(e.masks[c.key][5] for c in COMPONENTS)                         # S006 excluida por decisión


def test_metrics_against_hand_calculation():
    y = np.array([10.0, 12.0, 14.0, 20.0])
    p = np.array([11.0, 12.0, 13.0, 18.0])
    m = metrics(y, p)
    assert m["mae"] == pytest.approx((1 + 0 + 1 + 2) / 4)
    assert m["rmse"] == pytest.approx(np.sqrt((1 + 0 + 1 + 4) / 4))
    assert m["sesgo"] == pytest.approx((1 + 0 - 1 - 2) / 4)
    ss_tot = np.sum((y - y.mean()) ** 2)
    assert m["r2"] == pytest.approx(1 - 6 / ss_tot)


def test_folds_never_share_participants():
    groups = np.array([f"P{i}" for i in range(40)])
    seen = []
    for tr, te in participant_folds(groups, 5, seed=3):
        assert not set(groups[tr]) & set(groups[te])
        assert len(tr) + len(te) == 40
        seen += list(te)
    assert sorted(seen) == list(range(40))          # cada participante se evalúa exactamente una vez


def test_folds_with_repeated_measures_keep_each_person_whole():
    groups = np.array(["A", "A", "B", "B", "C", "C", "D", "D"])
    for tr, te in participant_folds(groups, 2, seed=1):
        assert not set(groups[tr]) & set(groups[te])


def test_holdout_separates_whole_participants():
    ids = [f"P{i}" for i in range(20)]
    dev, test = holdout_split(ids, 0.3, seed=1)
    assert not set(dev) & set(test) and len(dev) + len(test) == 20 and len(test) == 6


def test_with_too_few_rows_nothing_is_trained(tmp_path):
    write_workbook(make_sessions(3), tmp_path / "tres.xlsx")
    q = run_quality(tmp_path / "tres.xlsx", EvaluationSettings())
    assert all(not v["alcanza_para_modelar"] for v in q["disponibilidad_por_componente"].values())
    res = run_models(q["_df"], q["_elig"], EvaluationSettings())
    assert all(r["estado"] == "datos insuficientes" and r["salida_en_la_app"] == "Requiere prueba directa" for r in res.values())


def test_models_run_and_signal_is_recovered(book):
    settings = EvaluationSettings(min_rows_for_modeling=30, n_repeats=2)
    q = run_quality(book, settings)
    res = run_models(q["_df"], q["_elig"], settings)
    grip = res["Y3"]
    assert grip["estado"] == "evaluado" and grip["n"] == 60
    # en los datos sintéticos la fuerza depende del peso y del sexo: debe superar a la media
    assert grip["ganador"]["mae"] < grip["referencia_media_mae"]
    assert grip["cumple_criterios"] in (True, False)
    assert {t["modelo"] for t in grip["tabla"]} == {"lineal", "random_forest", "xgboost"}
    # el tronco es ruido puro: no debería salir una mejora clara sobre la media
    assert res["Y4"]["ganador"]["r2"] < 0.3


def test_holdout_run_reports_final_test(book):
    settings = EvaluationSettings(min_rows_for_modeling=30, n_repeats=1, holdout_fraction=0.3)
    q = run_quality(book, settings)
    res = run_models(q["_df"], q["_elig"], settings)
    assert "prueba_final" in res["Y3"]
    assert res["Y3"]["evaluacion"].endswith("prueba final en participantes apartados")


def test_figures_are_written(book, tmp_path):
    settings = EvaluationSettings(min_rows_for_modeling=30, n_repeats=1)
    q = run_quality(book, settings)
    run_models(q["_df"], q["_elig"], settings, figures_dir=tmp_path / "fig")
    names = {p.name for p in (tmp_path / "fig").iterdir()}
    assert "Y3_observado_vs_estimado.png" in names and "Y3_curva_aprendizaje.png" in names


def test_forcing_training_with_few_rows_never_declares_a_component_apt(tmp_path):
    write_workbook(make_sessions(12), tmp_path / "doce.xlsx")
    settings = EvaluationSettings(min_rows_for_modeling=8, k_folds=3, n_repeats=1)
    q = run_quality(tmp_path / "doce.xlsx", settings)
    res = run_models(q["_df"], q["_elig"], settings)
    assert all(r["cumple_criterios"] is False and r["salida_en_la_app"] == "Requiere prueba directa" and "advertencia" in r for r in res.values())


def test_csv_exported_by_the_app_loads_like_the_workbook(tmp_path, book):
    wb_df = load_sessions(book)
    csv = tmp_path / "sesiones.csv"
    wb_df.to_csv(csv, index=False, encoding="utf-8-sig")  # mismo formato: columnas con los nombres de la base, calculadas incluidas
    back = load_sessions(csv)
    assert len(back) == len(wb_df)
    assert back["imc_kg_m2"].round(6).tolist() == wb_df["imc_kg_m2"].round(6).tolist()
    assert back["c2km_total_s"].tolist() == wb_df["c2km_total_s"].tolist()


def test_external_key_matching_handles_the_irregular_source_codes():
    from capstone_ml.external_osf import _key

    assert _key("01F_LL") == "01F" and _key("02M-VK") == "02M" and _key("1m-PF") == "01M" and _key("09_MB") is None


def test_external_rows_skip_consent_rules_but_not_the_age_range(tmp_path):
    own = make_sessions(3)
    ext = make_sessions(40, seed=5)
    for c in ("consentimiento", "elegible", "parq_resultado", "criterio_seguridad", "entrena_competitivo", "parq_aplicado", "grip_mano_dominante"):
        ext[c] = np.nan
    ext["fuente"] = "externa"
    ext["id_participante"] = [f"E{i:03d}" for i in range(1, 41)]
    ext.loc[0, "edad_anios"] = 50
    write_workbook(own, tmp_path / "propia.xlsx")
    write_workbook(ext, tmp_path / "externa.xlsx")
    q = run_quality(tmp_path / "propia.xlsx", EvaluationSettings(), [tmp_path / "externa.xlsx"])
    y3 = q["disponibilidad_por_componente"]["Y3"]
    assert y3["n_disponible"] == 3 + 39 and y3["excluidos"] == {"E001": "edad fuera de 18 a 40 años"}
    assert q["campos_obligatorios_vacios"] == {}  # las filas externas no se juzgan con la ficha propia


def test_models_trained_with_external_people_are_never_declared_apt(tmp_path):
    own = make_sessions(3)
    ext = make_sessions(60, seed=6)
    ext["fuente"] = "externa"
    ext["id_participante"] = [f"E{i:03d}" for i in range(1, 61)]
    write_workbook(own, tmp_path / "propia.xlsx")
    write_workbook(ext, tmp_path / "externa.xlsx")
    settings = EvaluationSettings(n_repeats=1)
    q = run_quality(tmp_path / "propia.xlsx", settings, [tmp_path / "externa.xlsx"])
    res = run_models(q["_df"], q["_elig"], settings)
    y3 = res["Y3"]
    assert y3["estado"] == "evaluado" and y3["n_por_fuente"] == {"externa": 60, "propia": 3}
    assert y3["cumple_criterios"] is False and y3["salida_en_la_app"] == "Requiere prueba directa" and "externa" in y3["advertencia"]
