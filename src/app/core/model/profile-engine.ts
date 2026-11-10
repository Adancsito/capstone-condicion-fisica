import { BundleInput, ComponentKey, ComponentSpec, LevelSpec, ModelBundle, QuickSpec } from './model-bundle.types';
import { predict } from './model-evaluator';

/** Margen sobre el rango de entrenamiento (fracción del ancho del rango) dentro del cual se estima con aviso. */
export const RANGE_MARGIN = 0.03;

/** Umbral acordado para mostrar niveles (exactitud balanceada). */
export const BALANCED_ACCURACY_THRESHOLD = 0.7;

export type InputValues = Record<string, number | null | undefined>;
export type InputErrors = Record<string, string>;

export interface ComponentResult {
  key: ComponentKey;
  name: string;
  unit: string;
  status: 'value' | 'direct';
  /** Valor continuo en la unidad nativa de la prueba; solo si status = 'value'. */
  value: number | null;
  level: string | null;
  /** 'rapida' si se estimó con peso, talla, edad y sexo; 'completa' si se usaron además las circunferencias. */
  mode: 'rapida' | 'completa' | null;
  /** Error medio del modelo completo, para decir cuánto mejora la medición más precisa (solo en la estimación rápida). */
  fullMae: number | null;
  /** Puntos de corte usados para el nivel; solo si hay nivel. */
  levelSpec: LevelSpec | null;
  /** Rango medido de este componente en el estudio: referencia descriptiva para la regla, no una norma. */
  observedRange: [number, number] | null;
  /** 'limitada' si la ventaja del modelo sobre la base no es concluyente al repetir la validación (solo en la medición completa). */
  evidence: 'solida' | 'limitada' | null;
  /** Motivo por el que se pide la prueba directa. */
  reason: string | null;
  directTest: string;
  family: string | null;
  metrics: ComponentSpec['metrics'];
  note: string | null;
}

/** Decimales con que se muestra cada unidad. */
export function decimalsFor(unit: string): number {
  return unit === 's' ? 0 : 1;
}

/**
 * Entradas obligatorias: las que usan todos los componentes con modelo. Las demás son opcionales; si faltan, los componentes que
 * las necesitan piden la prueba directa.
 */
export function requiredInputKeys(bundle: ModelBundle, precise = false): Set<string> {
  if (!precise && hasQuick(bundle)) {
    return quickInputKeys(bundle);
  }
  const withModel = bundle.components.filter((c) => c.model);
  if (withModel.length === 0) {
    return new Set(bundle.inputs.map((i) => i.key));
  }
  const keys = new Set(bundle.inputs.filter((i) => withModel.every((c) => c.features.includes(i.key))).map((i) => i.key));
  // la medición más precisa suma las circunferencias a las cuatro medidas básicas
  quickInputKeys(bundle).forEach((k) => keys.add(k));
  return keys;
}

/** El paquete trae la medición rápida si algún componente tiene modelo rápido. */
export function hasQuick(bundle: ModelBundle): boolean {
  return bundle.components.some((c) => !!c.quick?.model);
}

/** Entradas de la medición rápida: las que usan los modelos rápidos (peso, talla, edad y sexo). */
export function quickInputKeys(bundle: ModelBundle): Set<string> {
  return new Set(bundle.components.flatMap((c) => c.quick?.features ?? []));
}

export function validateInputs(
  inputs: readonly BundleInput[],
  values: InputValues,
  required?: ReadonlySet<string>,
): InputErrors {
  const errors: InputErrors = {};
  for (const input of inputs) {
    const v = values[input.key];
    if (v === null || v === undefined || Number.isNaN(v)) {
      if (!required || required.has(input.key)) {
        errors[input.key] = input.type === 'sex' ? 'Elige una opción.' : 'Ingresa un valor.';
      }
      continue;
    }
    if (input.type === 'sex') {
      if (v !== 0 && v !== 1) {
        errors[input.key] = 'Elige una opción.';
      }
      continue;
    }
    if (v < input.min || v > input.max) {
      errors[input.key] = `El valor debe estar entre ${input.min} y ${input.max} ${input.unit}.`;
    }
  }
  return errors;
}

function levelFor(spec: LevelSpec | undefined, value: number): string | null {
  if (!spec || spec.balancedAccuracy <= BALANCED_ACCURACY_THRESHOLD) {
    return null;
  }
  if (value < spec.cutoffs[0]) {
    return spec.labels[0];
  }
  return value < spec.cutoffs[1] ? spec.labels[1] : spec.labels[2];
}

function direct(c: ComponentSpec, reason: string): ComponentResult {
  return {
    key: c.key, name: c.name, unit: c.unit, status: 'direct', value: null, level: null, mode: null, fullMae: null, evidence: null, levelSpec: null, observedRange: c.observedRange ?? null, reason,
    directTest: c.directTest, family: c.family ?? null, metrics: c.metrics, note: c.note,
  };
}

/**
 * Reglas de salida por componente, en este orden:
 * 1) sin modelo o sin cumplir los criterios de desempeño: "Requiere prueba directa";
 * 2) alguna entrada fuera del rango visto en el entrenamiento: "Requiere prueba directa";
 * 3) en otro caso, el valor continuo en la unidad nativa. Nunca hay puntaje total ni incertidumbre.
 */
/** Número con coma decimal y sin ceros sobrantes. */
function num(x: number): string {
  return String(Math.round(x * 10) / 10).replace('.', ',');
}

type Evaluation = { kind: 'ok'; value: number } | { kind: 'missing'; labels: string[] } | { kind: 'outside'; text: string[] };

/** Evalúa un modelo (completo o rápido) con las medidas dadas: valor, medidas que faltan o medidas fuera del rango de entrenamiento. */
function evaluate(bundle: ModelBundle, spec: Pick<QuickSpec, 'features' | 'model' | 'trainRange'>, values: InputValues): Evaluation {
  const missing = spec.features.filter((f) => {
    const v = values[f];
    return v === null || v === undefined || Number.isNaN(v);
  });
  if (missing.length > 0) {
    return { kind: 'missing', labels: missing.map((f) => (bundle.inputs.find((i) => i.key === f)?.label ?? f).toLowerCase()) };
  }
  const x: number[] = [];
  const outside: string[] = [];
  for (const f of spec.features) {
    const v = values[f] as number;
    x.push(v);
    const range = spec.trainRange[f];
    if (range && (v < range[0] || v > range[1])) {
      const input = bundle.inputs.find((i) => i.key === f);
      const unit = input?.unit ? ` ${input.unit}` : '';
      const text = `${(input?.label ?? f).toLowerCase()} ${num(v)}${unit} (rango ${num(range[0])} a ${num(range[1])}${unit})`;
      const margin = (range[1] - range[0]) * RANGE_MARGIN;
      if (v < range[0] - margin || v > range[1] + margin) {
        outside.push(text);
      }
    }
  }
  if (outside.length > 0) {
    return { kind: 'outside', text: outside };
  }
  return { kind: 'ok', value: predict(spec.model as NonNullable<QuickSpec['model']>, x) };
}

const OUTSIDE = (text: string[]) => `Tus medidas están fuera del rango con que se entrenó el modelo: ${text.join('; ')}.`;

export function computeProfile(bundle: ModelBundle, values: InputValues): ComponentResult[] {
  return bundle.components.map((c) => {
    if (!c.model) {
      return direct(c, 'Aún no hay datos suficientes para estimar este componente.');
    }
    if (!c.meetsCriteria) {
      return direct(c, 'El modelo no superó los criterios de desempeño frente a la línea de base.');
    }
    const value = (v: number, mode: 'rapida' | 'completa', metrics: ComponentSpec['metrics'], family: string | null): ComponentResult => {
      const level = levelFor(bundle.levels?.[c.key], v);
      return {
        key: c.key, name: c.name, unit: c.unit, status: 'value', value: v, level, mode, fullMae: mode === 'rapida' ? (c.metrics?.mae ?? null) : null,
        levelSpec: level ? (bundle.levels?.[c.key] ?? null) : null, observedRange: c.observedRange ?? null,
        evidence: mode === 'completa' ? (c.evidence ?? null) : null,
        reason: null, directTest: c.directTest, family, metrics, note: c.note,
      };
    };
    const full = evaluate(bundle, c, values);
    if (full.kind === 'ok') {
      return value(full.value, 'completa', c.metrics, c.family ?? null);
    }
    // Sin la medición completa (faltan circunferencias o están fuera de rango) se intenta la rápida, si el estudio la respalda.
    const q = c.quick;
    if (q?.model && q.meetsCriteria) {
      const quick = evaluate(bundle, q, values);
      if (quick.kind === 'ok') {
        return value(quick.value, 'rapida', q.metrics, q.family ?? null);
      }
      return quick.kind === 'missing'
        ? direct(c, `Faltan medidas para estimar este componente: ${quick.labels.join(', ')}.`)
        : direct(c, OUTSIDE(quick.text));
    }
    return full.kind === 'missing'
      ? direct(c, `Faltan medidas para estimar este componente: ${full.labels.join(', ')}.`)
      : direct(c, OUTSIDE(full.text));
  });
}
