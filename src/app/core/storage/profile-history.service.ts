import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { CloudService, cloudErrorMessage } from '../cloud/cloud.service';
import { ComponentResult, InputValues } from '../model/profile-engine';
import { removeKey } from './key-value-store';

export interface ProfileEntry {
  id: string;
  createdAt: string;
  bundleVersion: string;
  isDemo: boolean;
  inputs: InputValues;
  results: Pick<ComponentResult, 'key' | 'name' | 'unit' | 'status' | 'value' | 'reason'>[];
}

/** Clave del historial local de versiones anteriores, que se borra: el historial ahora vive solo en la cuenta de la persona. */
const LEGACY_KEY = 'capstone.perfil.historial';

/**
 * Historial del modo Perfil. Existe solo para quien inició sesión con Google: se guarda en Firestore bajo su cuenta y nadie más lo
 * lee. Sin sesión se puede hacer la prueba completa, pero no se guarda nada. Con la persistencia local de Firestore, guardar y
 * consultar funcionan sin conexión y se sincronizan al volver la red.
 */
@Injectable({ providedIn: 'root' })
export class ProfileHistoryService {
  private readonly cloud = inject(CloudService);

  readonly entries = signal<ProfileEntry[]>([]);
  /** Hay una cuenta con la que guardar y consultar. */
  readonly available = computed(() => this.cloud.user() !== null);
  /** Se están leyendo los perfiles de la cuenta. */
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    removeKey(LEGACY_KEY);
    effect((onCleanup) => {
      const uid = this.cloud.user()?.uid;
      this.entries.set([]);
      this.error.set('');
      if (!uid) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      let stop: (() => void) | null = null;
      let cancelled = false;
      void this.cloud
        .watchPerfiles(
          uid,
          (list) => {
            this.entries.set(list);
            this.loading.set(false);
          },
          (e) => {
            this.error.set(cloudErrorMessage(e));
            this.loading.set(false);
          },
        )
        .then((unsub) => (cancelled ? unsub() : (stop = unsub)))
        .catch((e) => {
          this.error.set(cloudErrorMessage(e));
          this.loading.set(false);
        });
      onCleanup(() => {
        cancelled = true;
        stop?.();
      });
    });
  }

  /** Guarda un perfil en la cuenta. Devuelve el perfil, o null si no hay sesión. */
  add(entry: Omit<ProfileEntry, 'id' | 'createdAt'>): ProfileEntry | null {
    const uid = this.cloud.user()?.uid;
    if (!uid) {
      return null;
    }
    const saved: ProfileEntry = { ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.fire(this.cloud.savePerfil(uid, saved));
    return saved;
  }

  remove(id: string): void {
    const uid = this.cloud.user()?.uid;
    if (uid) {
      this.fire(this.cloud.deletePerfil(uid, id));
    }
  }

  /** Borra todos los perfiles de la cuenta. */
  async clear(): Promise<void> {
    const uid = this.cloud.user()?.uid;
    if (uid) {
      await this.cloud.deleteAllPerfiles(uid);
    }
  }

  private fire(job: Promise<void>): void {
    job.catch((e) => this.error.set(cloudErrorMessage(e)));
  }
}
