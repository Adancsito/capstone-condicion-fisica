"""Configuración del análisis.

Todo lo marcado como PROVISIONAL está pendiente de aprobación del asesor (ver docs/15 del repositorio compartido:
"no inventar porcentajes de partición ni esquemas de validación en el código"). Se deja aquí, en un solo lugar y a la vista,
para poder cambiarlo sin tocar la lógica.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

# Base de datos de sesiones (una fila por participante).
DEFAULT_DATASET = Path(
    r"C:/Users/Jose/Documents/Codex/2026-08-27/realtime-voice-chat-2/capstone-shared/docs/T2/Base_de_datos_sesiones.xlsx"
)
DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "salida"
SHEET = "Registro"

# ----------------------------------------------------------------------------- predictores
# Entradas X: siete medidas corporales (promedio de las dos lecturas).
BASIC_X = ["peso_kg_prom", "talla_cm_prom"]
EXTENDED_X = BASIC_X + ["cintura_cm_prom", "cadera_cm_prom", "brazo_cm_prom", "muslo_cm_prom", "pantorrilla_cm_prom"]
# Covariables de perfil: se comparan los modelos con y sin ellas. No son indicadores morfológicos.
COVARIATES = ["edad_anios", "sexo_f"]

FEATURE_SETS: dict[str, list[str]] = {
    "basica": BASIC_X,
    "ampliada": EXTENDED_X,
    "basica_edad_sexo": BASIC_X + COVARIATES,
    "ampliada_edad_sexo": EXTENDED_X + COVARIATES,
}
# Línea de base de la matriz de consistencia: regresión lineal con peso y talla.
BASELINE_MODEL = "lineal"
BASELINE_FEATURES = "basica"


@dataclass(frozen=True)
class Component:
    key: str          # Y1 a Y5
    name: str
    target: str       # columna calculada en la base
    unit: str
    note: str = ""


COMPONENTS: list[Component] = [
    Component("Y1", "Composición corporal (% de grasa por bioimpedancia)", "bia_pct_grasa", "%"),
    Component("Y2", "Capacidad cardiorrespiratoria (tiempo de la caminata de 2 km)", "c2km_total_s", "s",
              "PROVISIONAL: el resultado definitivo es el VO2máx de la ecuación de Oja et al. (1991), cuyos coeficientes "
              "aún no están verificados contra la publicación original. Mientras tanto se modela el tiempo de caminata."),
    Component("Y3", "Fuerza muscular (prensión manual máxima)", "grip_kg_max", "kg"),
    Component("Y4", "Resistencia muscular (sostén de extensores del tronco)", "trunk_tiempo_s", "s"),
    Component("Y5", "Flexibilidad (alcance anterior, sit-and-reach)", "sr_cm_max", "cm"),
]

# ----------------------------------------------------------------------------- control de calidad
# Umbrales de diferencia entre las dos lecturas de una medida (procedimiento del proyecto; docs/05). El de las
# circunferencias distintas de la cintura se extiende por analogía: PENDIENTE de aprobación del asesor.
REPEATABILITY_THRESHOLDS = {
    "peso_kg": 0.2,
    "talla_cm": 0.5,
    "cintura_cm": 1.0,
    "cadera_cm": 1.0,
    "brazo_cm": 1.0,
    "muslo_cm": 1.0,
    "pantorrilla_cm": 1.0,
}
MEASURES = list(REPEATABILITY_THRESHOLDS)

# La prueba UKK se desarrolló con adultos de 20 a 65 años (Oja et al., 1991). El estudio incluye de 18 a 40, y por ahora Y2 se modela con el
# tiempo de caminata (no con la ecuación), así que el límite inferior sigue el del estudio. Revisar cuando se verifique la ecuación de Oja.
Y2_MIN_AGE = 18
Y2_MAX_AGE = 65


# Por debajo de este número de participantes ningún componente puede declararse apto, aunque se fuerce el entrenamiento
# con --min-rows para probar el programa. PROVISIONAL (cálculo de tamaño de muestra pendiente).
MIN_ROWS_RELIABLE = 30


@dataclass
class EvaluationSettings:
    """Parámetros de la validación. Todos PROVISIONALES salvo que el asesor indique otra cosa."""

    min_rows_for_modeling: int = 30   # PROVISIONAL: por debajo no se entrena nada.
    k_folds: int = 5                  # PROVISIONAL: pliegues de la validación cruzada por participante.
    n_repeats: int = 5                # PROVISIONAL: repeticiones con particiones distintas.
    holdout_fraction: float | None = None  # None = sin conjunto de prueba final (no se inventa la proporción).
    holdout_repeats: int = 1               # varias particiones de prueba final distintas, para medir cuánto cambia el resultado.
    seed: int = 20261019
    exclude_ids: list[str] = field(default_factory=list)  # p. ej. ["P001"] si el asesor decide no incluirla.


# Hiperparámetros fijos y conservadores para muestras pequeñas. PROVISIONALES; el ajuste fino se hará con validación
# anidada cuando existan los datos.
RANDOM_FOREST_PARAMS = dict(n_estimators=200, min_samples_leaf=3, max_features=1.0, n_jobs=-1)
XGBOOST_PARAMS = dict(n_estimators=150, learning_rate=0.05, max_depth=2, subsample=0.8, colsample_bytree=0.8,
                      reg_lambda=1.0, n_jobs=1, verbosity=0)
