import { SessionRecord } from '../protocol/protocol.types';
import { cloudErrorMessage } from '../cloud/cloud.service';
import { mergeSessions, parseBackup } from './session-merge';

function rec(id: string, updatedAt: string, status: SessionRecord['status'] = 'completa'): SessionRecord {
  return { id, status, values: { id_participante: id }, createdAt: '2026-10-17T00:00:00.000Z', updatedAt };
}

describe('Unión de sesiones locales y de la nube', () => {
  it('sube lo que la nube no tiene y baja lo que el dispositivo no tiene', () => {
    const r = mergeSessions([rec('P001', '2026-10-18T10:00:00Z'), rec('P002', '2026-10-18T10:00:00Z')], [rec('P002', '2026-10-18T10:00:00Z'), rec('P003', '2026-10-18T11:00:00Z')]);
    expect(r.merged.map((s) => s.id)).toEqual(['P001', 'P002', 'P003']);
    expect(r.toUpload.map((s) => s.id)).toEqual(['P001']);
    expect(r.toDownload.map((s) => s.id)).toEqual(['P003']);
  });

  it('por cada código gana la versión más reciente', () => {
    const local = rec('P001', '2026-10-18T12:00:00Z', 'completa');
    const remote = rec('P001', '2026-10-18T09:00:00Z', 'borrador');
    const r = mergeSessions([local], [remote]);
    expect(r.merged[0].status).toBe('completa');
    expect(r.toUpload).toEqual([local]);
    expect(r.toDownload).toEqual([]);
    const r2 = mergeSessions([remote], [local]);
    expect(r2.merged[0].status).toBe('completa');
    expect(r2.toDownload).toEqual([local]);
  });

  it('con versiones iguales no sube ni baja nada', () => {
    const a = rec('P001', '2026-10-18T12:00:00Z');
    const r = mergeSessions([a], [{ ...a }]);
    expect(r.toUpload).toEqual([]);
    expect(r.toDownload).toEqual([]);
  });
});

describe('Lectura de un respaldo JSON', () => {
  const NOW = '2026-10-20T10:00:00.000Z';

  it('convierte el respaldo en sesiones y omite los elementos mal formados', () => {
    const text = JSON.stringify([
      { id: 'P001', status: 'completa', values: { edad_anios: 22 } },
      { id: 'P002', status: 'borrador', values: {} },
      { id: 'X9', status: 'completa', values: {} },
      { id: 'P003', status: 'otro', values: {} },
      { id: 'P004', status: 'completa' },
    ]);
    const { records, skipped } = parseBackup(text, NOW);
    expect(records.map((r) => r.id)).toEqual(['P001', 'P002']);
    expect(skipped).toBe(3);
    expect(records[0].updatedAt).toBe(NOW);
    expect(records[0].values['edad_anios']).toBe(22);
  });

  it('un archivo que no es JSON o no es una lista no genera sesiones', () => {
    expect(parseBackup('no es json').records).toEqual([]);
    expect(parseBackup('{"id":"P001"}').records).toEqual([]);
  });
});

describe('Mensajes de error de la nube', () => {
  it('explica qué falta en Firebase cuando no está configurado', () => {
    expect(cloudErrorMessage({ code: 'auth/configuration-not-found' })).toContain('Authentication');
    expect(cloudErrorMessage({ code: 'not-found' })).toContain('Firestore');
    expect(cloudErrorMessage({ code: 'permission-denied' })).toContain('reglas');
    expect(cloudErrorMessage({ code: 'auth/operation-not-allowed' })).toContain('método de acceso');
    expect(cloudErrorMessage({ code: 'auth/email-already-in-use' })).toContain('Ingresar');
    expect(cloudErrorMessage({ code: 'auth/invalid-credential' })).toContain('incorrectos');
    expect(cloudErrorMessage({ code: 'auth/popup-closed-by-user' })).toContain('ventana de Google');
    expect(cloudErrorMessage({ code: 'auth/unauthorized-domain' })).toContain('Dominios autorizados');
  });
});
