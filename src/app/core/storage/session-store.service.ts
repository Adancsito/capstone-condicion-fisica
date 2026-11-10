import { Injectable, signal } from '@angular/core';

import { SessionRecord, SessionStatus, SessionValues } from '../protocol/protocol.types';
import { readJson, writeJson } from './key-value-store';

const KEY = 'capstone.investigador.sesiones';

/**
 * Almacén de sesiones del modo Investigador. Es local (en el dispositivo, sin conexión); la sincronización con Firestore la hace
 * CloudService y deja aquí la lista unida.
 */
@Injectable({ providedIn: 'root' })
export class SessionStoreService {
  readonly sessions = signal<SessionRecord[]>(readJson<SessionRecord[]>(KEY, []));

  get(id: string): SessionRecord | undefined {
    return this.sessions().find((s) => s.id === id);
  }

  /** Siguiente código libre: P001, P002… */
  nextCode(): string {
    const used = this.sessions()
      .map((s) => /^P(\d{3})$/.exec(s.id)?.[1])
      .filter((x): x is string => !!x)
      .map(Number);
    return `P${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
  }

  exists(id: string): boolean {
    return this.sessions().some((s) => s.id === id);
  }

  /** Crea o actualiza una sesión. Si el código cambia, el registro se mueve a su nuevo código. */
  save(previousId: string | null, values: SessionValues, status: SessionStatus): SessionRecord | null {
    const id = String(values['id_participante'] ?? '').trim();
    if (!id) {
      return null;
    }
    const now = new Date().toISOString();
    const old = previousId ? this.get(previousId) : undefined;
    if (id !== previousId && this.exists(id)) {
      return null; // el código nuevo ya existe
    }
    const record: SessionRecord = { id, status, values: { ...values }, createdAt: old?.createdAt ?? now, updatedAt: now };
    const rest = this.sessions().filter((s) => s.id !== previousId && s.id !== id);
    const next = [...rest, record].sort((a, b) => a.id.localeCompare(b.id));
    this.sessions.set(next);
    writeJson(KEY, next);
    return record;
  }

  /** Agrega o reemplaza registros completos (importación de un respaldo o sincronización). */
  upsertMany(records: readonly SessionRecord[]): void {
    const byId = new Map(this.sessions().map((s) => [s.id, s]));
    for (const r of records) {
      byId.set(r.id, r);
    }
    this.replaceAll([...byId.values()]);
  }

  /** Deja exactamente esta lista como almacén (resultado de unir con la nube). */
  replaceAll(records: readonly SessionRecord[]): void {
    const next = [...records].sort((a, b) => a.id.localeCompare(b.id));
    this.sessions.set(next);
    writeJson(KEY, next);
  }

  remove(id: string): void {
    const next = this.sessions().filter((s) => s.id !== id);
    this.sessions.set(next);
    writeJson(KEY, next);
  }
}
