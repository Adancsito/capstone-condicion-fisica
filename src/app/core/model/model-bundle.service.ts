import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ModelBundle } from './model-bundle.types';

export type BundleState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'rejected';

/** Comprueba lo mínimo del paquete antes de usarlo. Devuelve el motivo del rechazo, o null si es válido. */
export function bundleProblem(bundle: unknown, demoAllowed: boolean): string | null {
  const b = bundle as Partial<ModelBundle> | null;
  if (!b || typeof b !== 'object' || !b.manifest || !Array.isArray(b.inputs) || !Array.isArray(b.components)) {
    return 'El paquete de modelo no tiene el formato esperado.';
  }
  if (b.manifest.schemaVersion !== 1) {
    return `Versión de esquema no soportada: ${b.manifest.schemaVersion}.`;
  }
  if (b.manifest.isDemo && !demoAllowed) {
    return 'Un paquete de demostración no se puede usar en esta compilación.';
  }
  if (b.components.length !== 5) {
    return 'El paquete debe traer los cinco componentes.';
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class ModelBundleService {
  private readonly http = inject(HttpClient);

  readonly state = signal<BundleState>('idle');
  readonly bundle = signal<ModelBundle | null>(null);
  readonly problem = signal<string | null>(null);
  readonly isDemo = computed(() => this.bundle()?.manifest.isDemo ?? false);

  /** Carga el paquete definitivo; si no existe y la compilación lo permite, el de demostración (siempre rotulado). */
  async load(): Promise<void> {
    if (this.state() === 'ready' || this.state() === 'loading') {
      return;
    }
    this.state.set('loading');
    this.problem.set(null);
    const candidates = [environment.bundleUrl];
    if (environment.demoAllowed && environment.demoBundleUrl) {
      candidates.push(environment.demoBundleUrl);
    }
    for (const url of candidates) {
      try {
        const bundle = await firstValueFrom(this.http.get<ModelBundle>(url));
        const problem = bundleProblem(bundle, environment.demoAllowed);
        if (problem) {
          this.problem.set(problem);
          this.state.set('rejected');
          return;
        }
        this.bundle.set(bundle);
        this.state.set('ready');
        return;
      } catch {
        // se prueba el siguiente candidato
      }
    }
    this.state.set('unavailable');
  }
}
