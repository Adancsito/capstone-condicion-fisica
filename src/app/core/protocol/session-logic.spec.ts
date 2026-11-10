import { sessionsToCsv } from './csv';
import { Protocol, SessionRecord, SessionValues } from './protocol.types';
import { derived, gateFailures, gatePending, isRequired, repeatabilityFlags, validateSection } from './session-logic';

const protocol: Protocol = {
  protocolId: 'prueba',
  title: 'Ficha',
  sections: [
    {
      id: 'ident',
      title: 'Identificación',
      fields: [{ key: 'id_participante', label: 'Código', type: 'text', required: true, pattern: '^P\\d{3}$' }],
    },
    {
      id: 'bia',
      title: 'BIA',
      fields: [
        {
          key: 'bia_realizada', label: '¿Realizada?', type: 'select', required: true,
          options: [{ value: 'Sí', label: 'Sí' }, { value: 'No', label: 'No' }],
        },
        {
          key: 'bia_motivo_no', label: 'Motivo', type: 'text',
          required: { if: { key: 'bia_realizada', equals: 'No' } }, visibleIf: { key: 'bia_realizada', equals: 'No' },
        },
        {
          key: 'bia_pct_grasa', label: '% grasa', type: 'number', unit: '%', min: 3, max: 60,
          required: { if: { key: 'bia_realizada', equals: 'Sí' } }, visibleIf: { key: 'bia_realizada', equals: 'Sí' },
        },
      ],
    },
  ],
  gate: {
    appliesFromSection: 'bia',
    requires: [
      { key: 'consentimiento', equals: 'Sí', message: 'Sin consentimiento no se continúa.' },
      { key: 'parq_resultado', equals: 'Apto', message: 'PAR-Q+ no apto.' },
    ],
  },
  thresholds: { peso_kg: 0.2, talla_cm: 0.5, cintura_cm: 1, cadera_cm: 1, brazo_cm: 1, muslo_cm: 1, pantorrilla_cm: 1 },
  exportColumns: ['id_participante', 'peso_kg_1', 'peso_kg_2', 'peso_kg_prom', 'imc_kg_m2', 'incidentes', 'c2km_total_s'],
};

// Valores de una sesión real ya registrada (P003), para comprobar los cálculos contra la base de datos.
const p003: SessionValues = {
  peso_kg_1: 65, peso_kg_2: 65, talla_cm_1: 154, talla_cm_2: 154, cintura_cm_1: 85, cintura_cm_2: 84, cadera_cm_1: 89, cadera_cm_2: 88,
  brazo_cm_1: 29, brazo_cm_2: 30, muslo_cm_1: 49, muslo_cm_2: 52, pantorrilla_cm_1: 31, pantorrilla_cm_2: 32,
  sr_cm_1: -5, sr_cm_2: -3, sr_cm_3: -4, grip_kg_1: 32, grip_kg_2: 30, grip_kg_3: 30, c2km_min: 17, c2km_seg: 52,
};

describe('Sesión: validación según el protocolo', () => {
  it('exige el código con el formato P###', () => {
    expect(validateSection(protocol.sections[0], { id_participante: 'X1' })['id_participante']).toContain('Formato');
    expect(validateSection(protocol.sections[0], { id_participante: 'P007' })).toEqual({});
    expect(validateSection(protocol.sections[0], {})['id_participante']).toBeTruthy();
  });

  it('pide el motivo solo si la prueba no se realizó y el resultado solo si se realizó', () => {
    const bia = protocol.sections[1];
    expect(Object.keys(validateSection(bia, { bia_realizada: 'No' }))).toEqual(['bia_motivo_no']);
    expect(Object.keys(validateSection(bia, { bia_realizada: 'Sí' }))).toEqual(['bia_pct_grasa']);
    expect(validateSection(bia, { bia_realizada: 'Sí', bia_pct_grasa: 24.9 })).toEqual({});
  });

  it('no valida los campos ocultos', () => {
    const bia = protocol.sections[1];
    expect(validateSection(bia, { bia_realizada: 'No', bia_motivo_no: 'Sin equipo', bia_pct_grasa: 999 })).toEqual({});
    expect(isRequired(bia.fields[2], { bia_realizada: 'No' })).toBeFalse();
  });

  it('rechaza valores fuera del rango del protocolo y deja pasar los del límite', () => {
    const bia = protocol.sections[1];
    expect(validateSection(bia, { bia_realizada: 'Sí', bia_pct_grasa: 70 })['bia_pct_grasa']).toContain('entre 3 y 60');
    expect(validateSection(bia, { bia_realizada: 'Sí', bia_pct_grasa: 60 })).toEqual({});
  });
});

describe('Sesión: reglas de seguridad', () => {
  it('detecta las respuestas que impiden continuar', () => {
    expect(gateFailures(protocol, { consentimiento: 'No', parq_resultado: 'Apto' })).toEqual(['Sin consentimiento no se continúa.']);
    expect(gateFailures(protocol, { consentimiento: 'Sí', parq_resultado: 'Derivar' })).toEqual(['PAR-Q+ no apto.']);
    expect(gateFailures(protocol, { consentimiento: 'Sí', parq_resultado: 'Apto' })).toEqual([]);
  });

  it('distingue lo que aún no se respondió de lo que se respondió mal', () => {
    expect(gatePending(protocol, { consentimiento: 'Sí' })).toBeTrue();
    expect(gateFailures(protocol, { consentimiento: 'Sí' })).toEqual([]);
    expect(gatePending(protocol, { consentimiento: 'Sí', parq_resultado: 'Apto' })).toBeFalse();
  });
});

describe('Sesión: valores calculados', () => {
  it('coinciden con la base de datos para P003', () => {
    const d = derived(p003);
    expect(d['peso_kg_prom']).toBe(65);
    expect(d['cadera_cm_prom']).toBe(88.5);
    expect(d['imc_kg_m2']).toBeCloseTo(27.41, 2);
    expect(d['dif_muslo_cm']).toBe(3);
    expect(d['grip_kg_max']).toBe(32);
    expect(d['sr_cm_max']).toBe(-3);
    expect(d['c2km_total_s']).toBe(1072);
  });

  it('con una sola lectura promedia la disponible y no calcula la diferencia', () => {
    const d = derived({ peso_kg_1: 70 });
    expect(d['peso_kg_prom']).toBe(70);
    expect(d['dif_peso_kg']).toBeNull();
    expect(d['imc_kg_m2']).toBeNull();
  });

  it('marca solo las medidas que superan el umbral', () => {
    const flags = repeatabilityFlags(protocol, p003);
    expect(flags.map((f) => f.measure)).toEqual(['muslo_cm']);
    expect(flags[0].difference).toBe(3);
  });

  it('el umbral de peso se marca por encima de 0,2 kg y no en 0,2', () => {
    expect(repeatabilityFlags(protocol, { peso_kg_1: 99, peso_kg_2: 99.2 })).toEqual([]);
    expect(repeatabilityFlags(protocol, { peso_kg_1: 99, peso_kg_2: 99.3 }).length).toBe(1);
  });
});

describe('Exportación CSV', () => {
  const record: SessionRecord = {
    id: 'P003', status: 'completa', createdAt: '', updatedAt: '',
    values: { id_participante: 'P003', ...p003, incidentes: 'Ninguno, "sin novedad"' },
  };

  it('usa las columnas y el orden del protocolo, con las calculadas incluidas', () => {
    const lines = sessionsToCsv(protocol, [record]).trim().split('\n');
    expect(lines[0]).toBe(protocol.exportColumns.join(','));
    const cells = lines[1].split(',');
    expect(cells[0]).toBe('P003');
    expect(cells[3]).toBe('65'); // peso_kg_prom
    expect(cells[4].startsWith('27.407')).toBeTrue(); // imc
  });

  it('entrecomilla los textos con comas y comillas', () => {
    expect(sessionsToCsv(protocol, [record])).toContain('"Ninguno, ""sin novedad"""');
  });

  it('deja vacío lo que no se registró', () => {
    const csv = sessionsToCsv(protocol, [{ ...record, values: { id_participante: 'P010' } }]);
    expect(csv.trim().split('\n')[1]).toBe('P010,,,,,,');
  });
});
