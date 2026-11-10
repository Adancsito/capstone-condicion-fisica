import { SessionRecord, SessionStatus, SessionValues } from '../protocol/protocol.types';

export interface MergeResult {
  /** Lista final, ordenada por código. */
  merged: SessionRecord[];
  /** Registros locales que la nube no tiene o tiene más viejos. */
  toUpload: SessionRecord[];
  /** Registros de la nube que el dispositivo no tiene o tiene más viejos. */
  toDownload: SessionRecord[];
}

/** Une las sesiones locales con las de la nube: por cada código gana la versión más reciente (updatedAt). */
export function mergeSessions(local: readonly SessionRecord[], remote: readonly SessionRecord[]): MergeResult {
  const byId = new Map<string, SessionRecord>();
  const toUpload: SessionRecord[] = [];
  const toDownload: SessionRecord[] = [];
  for (const l of local) {
    byId.set(l.id, l);
  }
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l) {
      byId.set(r.id, r);
      toDownload.push(r);
    } else if (r.updatedAt > l.updatedAt) {
      byId.set(r.id, r);
      toDownload.push(r);
    } else if (l.updatedAt > r.updatedAt) {
      toUpload.push(l);
    }
  }
  const remoteIds = new Set(remote.map((r) => r.id));
  for (const l of local) {
    if (!remoteIds.has(l.id)) {
      toUpload.push(l);
    }
  }
  const merged = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { merged, toUpload, toDownload };
}

const STATUSES: readonly SessionStatus[] = ['borrador', 'completa', 'no_continua'];

/**
 * Lee un respaldo JSON (el que genera "Respaldo JSON") y lo convierte en sesiones. Devuelve también los elementos que se descartaron,
 * para avisar al usuario en vez de perderlos en silencio.
 */
export function parseBackup(text: string, now = new Date().toISOString()): { records: SessionRecord[]; skipped: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { records: [], skipped: 0 };
  }
  if (!Array.isArray(data)) {
    return { records: [], skipped: 0 };
  }
  const records: SessionRecord[] = [];
  let skipped = 0;
  for (const item of data as Record<string, unknown>[]) {
    const id = typeof item?.['id'] === 'string' ? (item['id'] as string).trim() : '';
    const values = item?.['values'];
    const status = item?.['status'] as SessionStatus;
    if (!/^P\d{3}$/.test(id) || !values || typeof values !== 'object' || !STATUSES.includes(status)) {
      skipped++;
      continue;
    }
    records.push({
      id,
      status,
      values: values as SessionValues,
      createdAt: typeof item['createdAt'] === 'string' ? (item['createdAt'] as string) : now,
      updatedAt: typeof item['updatedAt'] === 'string' ? (item['updatedAt'] as string) : now,
    });
  }
  return { records, skipped };
}
