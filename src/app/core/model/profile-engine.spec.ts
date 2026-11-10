import { ComponentSpec, ModelBundle } from './model-bundle.types';
import { computeProfile, hasQuick, requiredInputKeys, validateInputs } from './profile-engine';

function component(key: ComponentSpec['key'], over: Partial<ComponentSpec> = {}): ComponentSpec {
  return {
    key, name: `Componente ${key}`, unit: 'kg', directTest: 'Prueba directa', note: null, features: ['peso', 'talla'],
    model: { type: 'linear', intercept: 10, coef: [0.5, 0.1] }, family: 'regresión lineal', meetsCriteria: true,
    metrics: { mae: 2, rmse: 3, r2: 0.5, bias: 0, baselineMae: 3, n: 80, validation: 'prueba' },
    trainRange: { peso: [50, 100], talla: [150, 190] }, trainN: 80, ...over,
  };
}

function bundle(over: Partial<ModelBundle> = {}): ModelBundle {
  return {
    manifest: { schemaVersion: 1, bundleVersion: 't', createdAt: '', isDemo: true, description: '', population: '', trainedRows: 80, validationNote: '' },
    inputs: [
      { key: 'peso', label: 'Peso', unit: 'kg', type: 'number', min: 30, max: 250, help: '' },
      { key: 'talla', label: 'Talla', unit: 'cm', type: 'number', min: 120, max: 230, help: '' },
      { key: 'cintura', label: 'Cintura', unit: 'cm', type: 'number', min: 40, max: 200, help: '' },
      { key: 'sexo_f', label: 'Sexo', unit: '', type: 'sex', min: 0, max: 1, help: '' },
    ],
    components: [component('Y1'), component('Y2'), component('Y3'), component('Y4'), component('Y5')],
    levels: null, ...over,
  };
}

describe('Perfil: reglas de salida por componente', () => {
  const values = { peso: 70, talla: 170 };

  it('muestra el valor continuo en la unidad nativa cuando el componente cumple', () => {
    const r = computeProfile(bundle(), values)[0];
    expect(r.status).toBe('value');
    expect(r.value).toBeCloseTo(10 + 35 + 17);
  });

  it('pide la prueba directa si el componente no cumple los criterios', () => {
    const b = bundle({ components: [component('Y1', { meetsCriteria: false }), component('Y2'), component('Y3'), component('Y4'), component('Y5')] });
    const r = computeProfile(b, values)[0];
    expect(r.status).toBe('direct');
    expect(r.value).toBeNull();
    expect(r.reason).toContain('criterios');
  });

  it('pide la prueba directa si no hay modelo', () => {
    const b = bundle({ components: [component('Y1', { model: null, features: [] }), component('Y2'), component('Y3'), component('Y4'), component('Y5')] });
    expect(computeProfile(b, values)[0].status).toBe('direct');
  });

  it('pide la prueba directa si una entrada cae fuera del rango de entrenamiento y nombra la medida', () => {
    const r = computeProfile(bundle(), { peso: 120, talla: 170 })[0];
    expect(r.status).toBe('direct');
    expect(r.reason).toContain('peso');
  });

  it('pide la prueba directa si falta una medida opcional que el modelo usa', () => {
    const b = bundle({ components: [component('Y1', { features: ['peso', 'cintura'], model: { type: 'linear', intercept: 0, coef: [1, 1] }, trainRange: { peso: [50, 100], cintura: [60, 120] } }), component('Y2'), component('Y3'), component('Y4'), component('Y5')] });
    const r = computeProfile(b, values)[0];
    expect(r.status).toBe('direct');
    expect(r.reason).toContain('cintura');
  });

  it('devuelve cinco resultados independientes y ningún puntaje total', () => {
    const r = computeProfile(bundle(), values);
    expect(r.length).toBe(5);
    expect(Object.keys(r[0])).not.toContain('total');
  });

  it('no muestra nivel si la exactitud balanceada no supera 70 %', () => {
    const levels = { Y1: { labels: ['Bajo', 'Promedio', 'Alto'] as [string, string, string], cutoffs: [50, 70] as [number, number], balancedAccuracy: 0.7, source: 'prueba' } };
    expect(computeProfile(bundle({ levels }), values)[0].level).toBeNull();
  });

  it('muestra nivel solo si la exactitud balanceada supera 70 %', () => {
    const levels = { Y1: { labels: ['Bajo', 'Promedio', 'Alto'] as [string, string, string], cutoffs: [50, 70] as [number, number], balancedAccuracy: 0.74, source: 'prueba' } };
    expect(computeProfile(bundle({ levels }), values)[0].level).toBe('Promedio'); // valor 62: entre 50 y 70
  });

  it('asigna Bajo y Alto según los puntos de corte', () => {
    const levels = { Y1: { labels: ['Bajo', 'Promedio', 'Alto'] as [string, string, string], cutoffs: [70, 80] as [number, number], balancedAccuracy: 0.8, source: 'prueba' } };
    expect(computeProfile(bundle({ levels }), values)[0].level).toBe('Bajo'); // 62 < 70
    const high = { Y1: { ...levels.Y1, cutoffs: [40, 55] as [number, number] } };
    expect(computeProfile(bundle({ levels: high }), values)[0].level).toBe('Alto'); // 62 >= 55
  });
});

describe('Perfil: validación de entradas', () => {
  const b = bundle();
  const required = requiredInputKeys(b);

  it('exige solo las entradas que usan todos los componentes con modelo', () => {
    expect([...required].sort()).toEqual(['peso', 'talla']);
  });

  it('acepta entradas válidas y deja pasar las opcionales vacías', () => {
    expect(validateInputs(b.inputs, { peso: 70, talla: 170 }, required)).toEqual({});
  });

  it('rechaza obligatorias vacías y valores fuera del rango de captura', () => {
    const e = validateInputs(b.inputs, { peso: null, talla: 300, cintura: 10 }, required);
    expect(e['peso']).toBeTruthy();
    expect(e['talla']).toContain('entre 120 y 230');
    expect(e['cintura']).toContain('entre 40 y 200');
  });

  it('el sexo solo admite 0 o 1', () => {
    expect(validateInputs(b.inputs, { peso: 70, talla: 170, sexo_f: 2 }, required)['sexo_f']).toBeTruthy();
  });
});

describe('Perfil: medición rápida y medición más precisa', () => {
  const quickSpec = (over: Partial<NonNullable<ComponentSpec['quick']>> = {}): NonNullable<ComponentSpec['quick']> => ({
    features: ['peso', 'talla'], model: { type: 'linear', intercept: 0, coef: [1, 0] }, family: 'regresión lineal', meetsCriteria: true,
    metrics: { mae: 4, rmse: 5, r2: 0.4, bias: 0, baselineMae: 5, n: 80, validation: 'prueba' }, trainRange: { peso: [50, 100], talla: [150, 190] }, ...over,
  });
  const full = (over: Partial<ComponentSpec> = {}) =>
    component('Y1', {
      features: ['peso', 'talla', 'cintura'], model: { type: 'linear', intercept: 0, coef: [0, 0, 1] }, trainRange: { peso: [50, 100], talla: [150, 190], cintura: [60, 120] },
      quick: quickSpec(), ...over,
    });
  const b = (c: ComponentSpec) => bundle({ components: [c, component('Y2'), component('Y3'), component('Y4'), component('Y5')] });

  it('sin circunferencias usa el modelo rápido y lo marca como estimación rápida', () => {
    const r = computeProfile(b(full()), { peso: 70, talla: 170 })[0];
    expect(r.status).toBe('value');
    expect(r.mode).toBe('rapida');
    expect(r.value).toBeCloseTo(70);
    expect(r.fullMae).toBe(2);
    expect(r.metrics?.mae).toBe(4);
  });

  it('con las circunferencias usa el modelo completo', () => {
    const r = computeProfile(b(full()), { peso: 70, talla: 170, cintura: 90 })[0];
    expect(r.mode).toBe('completa');
    expect(r.value).toBeCloseTo(90);
    expect(r.fullMae).toBeNull();
  });

  it('no ofrece la estimación rápida si el modelo rápido no cumple los criterios', () => {
    const r = computeProfile(b(full({ quick: quickSpec({ meetsCriteria: false }) })), { peso: 70, talla: 170 })[0];
    expect(r.status).toBe('direct');
    expect(r.reason).toContain('cintura');
  });

  it('no ofrece la estimación rápida si el componente completo no cumple los criterios', () => {
    const r = computeProfile(b(full({ meetsCriteria: false })), { peso: 70, talla: 170 })[0];
    expect(r.status).toBe('direct');
    expect(r.mode).toBeNull();
  });

  it('si una circunferencia cae fuera de rango, cae a la estimación rápida', () => {
    const r = computeProfile(b(full()), { peso: 70, talla: 170, cintura: 200 })[0];
    expect(r.mode).toBe('rapida');
  });

  it('pide la prueba directa si una medida básica cae fuera del rango', () => {
    const r = computeProfile(b(full()), { peso: 120, talla: 170 })[0];
    expect(r.status).toBe('direct');
    expect(r.reason).toContain('peso');
  });

  it('la medición rápida pide solo las medidas del modelo rápido y la precisa suma las circunferencias', () => {
    const bundleQ = bundle({ components: ['Y1', 'Y2', 'Y3', 'Y4', 'Y5'].map((k) => ({ ...full(), key: k as ComponentSpec['key'] })) });
    expect([...requiredInputKeys(bundleQ)].sort()).toEqual(['peso', 'talla']);
    expect([...requiredInputKeys(bundleQ, true)].sort()).toEqual(['cintura', 'peso', 'talla']);
    expect(hasQuick(bundleQ)).toBeTrue();
    expect(hasQuick(bundle())).toBeFalse();
  });
});

describe('Perfil: margen sobre el rango de entrenamiento', () => {
  const b = () => bundle({ components: [component('Y1'), component('Y2'), component('Y3'), component('Y4'), component('Y5')] });

  it('estima si una medida queda dentro del margen del 3 % del rango', () => {
    // rango de talla 150 a 190 (ancho 40): el margen es 1,2 cm
    const r = computeProfile(b(), { peso: 70, talla: 190.8 })[0];
    expect(r.status).toBe('value');
  });

  it('pide la prueba directa si la medida pasa del margen', () => {
    const r = computeProfile(b(), { peso: 70, talla: 192 })[0];
    expect(r.status).toBe('direct');
    expect(r.reason).toContain('talla');
  });

  it('estima si la medida está dentro del rango', () => {
    expect(computeProfile(b(), { peso: 70, talla: 170 })[0].status).toBe('value');
  });
});

describe('Perfil: evidencia del componente', () => {
  it('pasa la evidencia limitada del componente a la tarjeta de la medición completa y no a la rápida', () => {
    const c = component('Y1', { evidence: 'limitada' });
    const r = computeProfile(bundle({ components: [c, component('Y2'), component('Y3'), component('Y4'), component('Y5')] }), { peso: 70, talla: 170 })[0];
    expect(r.evidence).toBe('limitada');
    const quick = component('Y1', { evidence: 'limitada', features: ['peso', 'talla', 'cintura'], trainRange: { peso: [50, 100], talla: [150, 190], cintura: [60, 120] },
      quick: { features: ['peso', 'talla'], model: { type: 'linear', intercept: 0, coef: [1, 0] }, meetsCriteria: true, metrics: null, trainRange: { peso: [50, 100], talla: [150, 190] } } });
    const q = computeProfile(bundle({ components: [quick, component('Y2'), component('Y3'), component('Y4'), component('Y5')] }), { peso: 70, talla: 170 })[0];
    expect(q.mode).toBe('rapida');
    expect(q.evidence).toBeNull();
  });
});
