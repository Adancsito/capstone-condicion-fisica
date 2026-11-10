/** Tipos del paquete de modelo JSON que produce el programa de Python (ml/capstone_ml/export.py). */

export type ComponentKey = 'Y1' | 'Y2' | 'Y3' | 'Y4' | 'Y5';

export interface BundleManifest {
  schemaVersion: number;
  bundleVersion: string;
  createdAt: string;
  isDemo: boolean;
  description: string;
  population: string;
  trainedRows: number;
  validationNote: string;
  /** Cita de los datos con que se entrenó el paquete (obligatoria si son datos públicos de terceros). */
  dataSource?: string | null;
}

export interface BundleInput {
  key: string;
  label: string;
  unit: string;
  type: 'number' | 'sex';
  /** Rango de plausibilidad de captura (no es el rango de entrenamiento). */
  min: number;
  max: number;
  help: string;
}

export interface LinearSpec {
  type: 'linear';
  intercept: number;
  coef: number[];
}

export interface ForestTree {
  left: number[];
  right: number[];
  feature: number[];
  threshold: number[];
  value: number[];
}

export interface ForestSpec {
  type: 'random_forest';
  trees: ForestTree[];
}

export interface XgbTree {
  feature: number[];
  threshold: number[];
  yes: number[];
  no: number[];
  missing: number[];
  leaf: number[];
}

export interface XgbSpec {
  type: 'xgboost';
  baseScore: number;
  trees: XgbTree[];
}

export type ModelSpec = LinearSpec | ForestSpec | XgbSpec;

export interface ComponentMetrics {
  mae: number;
  rmse: number;
  r2: number;
  bias: number;
  baselineMae: number | null;
  n: number;
  validation: string;
}

/** Modelo de la medición rápida de un componente; se evalúa con el mismo criterio que el modelo completo. */
export interface QuickSpec {
  features: string[];
  model: ModelSpec | null;
  family?: string;
  featureSet?: string;
  meetsCriteria: boolean;
  metrics: ComponentMetrics | null;
  trainRange: Record<string, [number, number]>;
}

export interface ComponentSpec {
  key: ComponentKey;
  name: string;
  unit: string;
  directTest: string;
  note: string | null;
  features: string[];
  model: ModelSpec | null;
  family?: string;
  featureSet?: string;
  meetsCriteria: boolean;
  metrics: ComponentMetrics | null;
  trainRange: Record<string, [number, number]>;
  trainN: number;
  /** Menor y mayor valor medido de este componente en los participantes del estudio (referencia descriptiva, no una norma). */
  observedRange?: [number, number] | null;
  /** Medición rápida: modelo con solo peso, talla, edad y sexo. Se usa cuando faltan las circunferencias. */
  quick?: QuickSpec | null;
  /** 'limitada' si el componente cumple el criterio pero el intervalo de confianza de su ventaja incluye el cero. */
  evidence?: 'solida' | 'limitada' | null;
}

/** Niveles Bajo/Promedio/Alto: solo con puntos de corte externos y exactitud balanceada mayor al 70 %. */
export interface LevelSpec {
  labels: [string, string, string];
  cutoffs: [number, number];
  balancedAccuracy: number;
  source: string;
}

export interface ModelBundle {
  manifest: BundleManifest;
  inputs: BundleInput[];
  components: ComponentSpec[];
  levels: Partial<Record<ComponentKey, LevelSpec>> | null;
}
