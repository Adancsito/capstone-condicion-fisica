import { Condition, FieldSpec, FieldValue, Protocol, SectionSpec, SessionValues } from './protocol.types';

export type FieldErrors = Record<string, string>;

const isEmpty = (v: FieldValue | undefined): boolean => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

function matches(values: SessionValues, c: Condition): boolean {
  return String(values[c.key] ?? '') === c.equals;
}

export function isVisible(field: FieldSpec, values: SessionValues): boolean {
  return !field.visibleIf || matches(values, field.visibleIf);
}

export function isRequired(field: FieldSpec, values: SessionValues): boolean {
  if (!isVisible(field, values)) {
    return false;
  }
  return typeof field.required === 'boolean' ? field.required : matches(values, field.required.if);
}

/** Validación de una sección: obligatorios según las condiciones, rangos y formato del código. */
export function validateSection(section: SectionSpec, values: SessionValues): FieldErrors {
  const errors: FieldErrors = {};
  for (const f of section.fields) {
    if (!isVisible(f, values)) {
      continue;
    }
    const v = values[f.key];
    if (isEmpty(v)) {
      if (isRequired(f, values)) {
        errors[f.key] = f.type === 'select' ? 'Elige una opción.' : 'Este dato es obligatorio.';
      }
      continue;
    }
    if (f.type === 'number' || f.type === 'integer') {
      const n = Number(v);
      if (Number.isNaN(n)) {
        errors[f.key] = 'Escribe un número.';
      } else if (f.type === 'integer' && !Number.isInteger(n)) {
        errors[f.key] = 'Escribe un número entero.';
      } else if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
        errors[f.key] = `Debe estar entre ${f.min ?? '−∞'} y ${f.max ?? '∞'}${f.unit ? ' ' + f.unit : ''}.`;
      }
    }
    if (f.pattern && !new RegExp(f.pattern).test(String(v))) {
      errors[f.key] = 'Formato no válido. Usa P001, P002…';
    }
  }
  return errors;
}

export function sectionIndex(protocol: Protocol, id: string): number {
  return protocol.sections.findIndex((s) => s.id === id);
}

/** Reglas de seguridad: si alguna falla, no se continúa con las pruebas. Devuelve los mensajes de las que fallan. */
export function gateFailures(protocol: Protocol, values: SessionValues): string[] {
  return protocol.gate.requires.filter((r) => !isEmpty(values[r.key]) && !matches(values, r)).map((r) => r.message);
}

/** Todavía no se respondió alguna regla de seguridad: no se puede avanzar a las pruebas. */
export function gatePending(protocol: Protocol, values: SessionValues): boolean {
  return protocol.gate.requires.some((r) => isEmpty(values[r.key]));
}

// ---------------------------------------------------------------------------------------------- valores derivados
export const MEASURES = ['peso_kg', 'talla_cm', 'cintura_cm', 'cadera_cm', 'brazo_cm', 'muslo_cm', 'pantorrilla_cm'] as const;

const num = (v: FieldValue | undefined): number | null => {
  if (isEmpty(v)) {
    return null;
  }
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const mean = (a: number | null, b: number | null): number | null => {
  const xs = [a, b].filter((x): x is number => x !== null);
  return xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length;
};

const max = (xs: (number | null)[]): number | null => {
  const ys = xs.filter((x): x is number => x !== null);
  return ys.length === 0 ? null : Math.max(...ys);
};

/** Las mismas variables que calcula la hoja de la base de datos y el programa de Python. */
export function derived(values: SessionValues): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const m of MEASURES) {
    const a = num(values[`${m}_1`]);
    const b = num(values[`${m}_2`]);
    out[`${m}_prom`] = mean(a, b);
    out[`dif_${m}`] = a !== null && b !== null ? Math.abs(a - b) : null;
  }
  const peso = out['peso_kg_prom'];
  const talla = out['talla_cm_prom'];
  out['imc_kg_m2'] = peso !== null && talla !== null ? peso / (talla / 100) ** 2 : null;
  out['grip_kg_max'] = max([1, 2, 3].map((i) => num(values[`grip_kg_${i}`])));
  out['sr_cm_max'] = max([1, 2, 3].map((i) => num(values[`sr_cm_${i}`])));
  const min = num(values['c2km_min']);
  const seg = num(values['c2km_seg']);
  out['c2km_total_s'] = min !== null && seg !== null ? min * 60 + seg : null;
  return out;
}

export interface RepeatabilityFlag {
  measure: string;
  difference: number;
  threshold: number;
}

/** Medidas cuyas dos lecturas difieren más que el umbral del procedimiento (se marcan, no se descartan). */
export function repeatabilityFlags(protocol: Protocol, values: SessionValues): RepeatabilityFlag[] {
  const d = derived(values);
  const flags: RepeatabilityFlag[] = [];
  for (const m of MEASURES) {
    const diff = d[`dif_${m}`];
    const threshold = protocol.thresholds[m];
    if (diff !== null && threshold !== undefined && diff > threshold + 1e-9) {
      flags.push({ measure: m, difference: diff, threshold });
    }
  }
  return flags;
}

/** Un participante cuyo UKK no es válido: trotó durante la caminata. */
export function ukkInvalid(values: SessionValues): boolean {
  return values['cardio_realizada'] === 'Sí' && values['c2km_troto'] === 'Sí';
}
