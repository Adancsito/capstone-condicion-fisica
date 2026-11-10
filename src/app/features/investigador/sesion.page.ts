import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ProtocolService } from '../../core/protocol/protocol.service';
import { FieldSpec, FieldValue, Protocol, SectionSpec, SessionValues } from '../../core/protocol/protocol.types';
import {
  FieldErrors, derived, gateFailures, gatePending, isVisible, repeatabilityFlags, sectionIndex, ukkInvalid, validateSection,
} from '../../core/protocol/session-logic';
import { SessionStoreService } from '../../core/storage/session-store.service';
import { FieldInputComponent } from '../../shared/field-input.component';
import { StopwatchComponent } from '../../shared/stopwatch.component';

const MEASURE_NAMES: Record<string, string> = {
  peso_kg: 'Peso', talla_cm: 'Talla', cintura_cm: 'Cintura', cadera_cm: 'Cadera', brazo_cm: 'Brazo', muslo_cm: 'Muslo', pantorrilla_cm: 'Pantorrilla',
};

/** Formulario de una sesión, paso a paso, generado a partir del protocolo. Guarda el borrador en cada cambio. */
@Component({
  selector: 'app-sesion-page',
  imports: [RouterLink, FieldInputComponent, StopwatchComponent],
  template: `
    <main class="page">
      <a class="back-link" routerLink="/investigador">← Sesiones</a>

      @if (protocol(); as p) {
        @if (section(); as sec) {
          <header class="step-head">
            <h1>{{ values()['id_participante'] || 'Nueva sesión' }}</h1>
            <p class="muted" aria-live="polite">Paso {{ index() + 1 }} de {{ p.sections.length }} · {{ sec.title }}</p>
            <progress [max]="p.sections.length" [value]="index() + 1" aria-label="Avance de la ficha"></progress>
          </header>

          @if (blocked().length > 0) {
            <div class="notice error" role="alert">
              <strong>No se continúa con las pruebas.</strong>
              <ul>
                @for (m of blocked(); track m) { <li>{{ m }}</li> }
              </ul>
              <p>Puedes corregir una respuesta equivocada o cerrar la sesión sin pruebas.</p>
              <div class="actions">
                <button type="button" class="btn secondary" (click)="goTo(sectionIndex2(p, 'elegib'))">Revisar respuestas</button>
                <button type="button" class="btn danger" (click)="closeWithoutTests()">Cerrar sin pruebas</button>
              </div>
            </div>
          } @else {
            <div class="card fields">
            @for (f of sec.fields; track f.key) {
              @if (visible(f)) {
                <app-field [field]="f" [value]="values()[f.key] ?? null" [error]="errors()[f.key] || null" (changed)="set(f.key, $event)" />
                @if (f.key === 'trunk_tiempo_s') {
                  <app-stopwatch (used)="set('trunk_tiempo_s', $event)" />
                }
                @if (f.key === 'c2km_seg') {
                  <app-stopwatch (used)="setWalkTime($event)" />
                }
              }
            }
            </div>

            @if (sec.id === 'antrop') {
              <section class="card" aria-label="Valores calculados">
                <h2>Calculado</h2>
                <p>IMC: <strong>{{ fmt(calc()['imc_kg_m2'], 1) }}</strong> kg/m²</p>
                @for (fl of flags(); track fl.measure) {
                  <p class="warnline" role="alert">
                    {{ measureName(fl.measure) }}: las dos lecturas difieren {{ fl.difference.toFixed(1) }} (umbral {{ fl.threshold }}). Repite la medida.
                  </p>
                }
                @if (flags().length === 0 && hasPairs()) {
                  <p class="muted">Las lecturas están dentro de los umbrales de repetibilidad.</p>
                }
              </section>
            }
            @if (sec.id === 'flex') {
              <p class="muted">Mejor intento: <strong>{{ fmt(calc()['sr_cm_max'], 1) }}</strong> cm</p>
            }
            @if (sec.id === 'grip') {
              <p class="muted">Máximo: <strong>{{ fmt(calc()['grip_kg_max'], 1) }}</strong> kg</p>
            }
            @if (sec.id === 'cardio') {
              <p class="muted">Tiempo total: <strong>{{ fmt(calc()['c2km_total_s'], 0) }}</strong> s</p>
              @if (invalidUkk()) {
                <p class="warnline" role="alert">Si el participante trotó, la prueba UKK no es válida para el análisis.</p>
              }
            }
          }

          @if (saveError()) {
            <p class="notice" role="alert">{{ saveError() }}</p>
          }
          @if (sectionErrors().length > 0) {
            <div class="notice" role="alert">
              <strong>Faltan datos o hay errores en:</strong> {{ sectionErrors().join(', ') }}.
            </div>
          }

          <div class="actions stretch sticky">
            <button type="button" class="btn secondary" (click)="back()" [disabled]="index() === 0">Anterior</button>
            @if (index() < p.sections.length - 1) {
              <button type="button" class="btn" (click)="next()" [disabled]="blocked().length > 0">Siguiente</button>
            } @else {
              <button type="button" class="btn" (click)="finish()">Cerrar sesión</button>
            }
            <a class="btn secondary" routerLink="/investigador">Guardar y salir</a>
          </div>
        }
      } @else if (protocols.failed()) {
        <p class="notice" role="alert">No se pudo cargar el protocolo de captura.</p>
      } @else {
        <p class="muted" role="status">Cargando el protocolo…</p>
      }
    </main>
  `,
  styles: `
    .step-head { display: grid; gap: var(--space-2); }
    .step-head h1, .step-head p { margin: 0; }
    .fields { display: grid; gap: var(--space-4); }
    .fields .field { margin: 0; }
    .warnline { color: var(--color-warning-text); background: var(--color-warning-bg); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); }
    .notice ul { margin: var(--space-2) 0; padding-left: var(--space-5); }
  `,
})
export class SesionPage {
  /** Parámetro de ruta: "nueva" o el código del participante. */
  readonly id = input<string>('nueva');

  protected readonly protocols = inject(ProtocolService);
  private readonly store = inject(SessionStoreService);
  private readonly router = inject(Router);

  protected readonly protocol = this.protocols.protocol;
  protected readonly values = signal<SessionValues>({});
  protected readonly errors = signal<FieldErrors>({});
  protected readonly index = signal(0);
  protected readonly saveError = signal<string | null>(null);
  protected readonly sectionErrors = signal<string[]>([]);
  private previousId: string | null = null;
  private status: 'borrador' | 'completa' | 'no_continua' = 'borrador';

  protected readonly section = computed<SectionSpec | null>(() => this.protocol()?.sections[this.index()] ?? null);
  protected readonly calc = computed(() => derived(this.values()));
  protected readonly flags = computed(() => {
    const p = this.protocol();
    return p ? repeatabilityFlags(p, this.values()) : [];
  });
  protected readonly invalidUkk = computed(() => ukkInvalid(this.values()));
  /** Mensajes de las reglas de seguridad que fallan; solo importan desde la antropometría en adelante. */
  protected readonly blocked = computed(() => {
    const p = this.protocol();
    if (!p || this.index() < sectionIndex(p, p.gate.appliesFromSection)) {
      return [];
    }
    return gateFailures(p, this.values());
  });

  constructor() {
    void this.protocols.load().then((p) => p && this.init(p));
  }

  private init(p: Protocol): void {
    const existing = this.id() !== 'nueva' ? this.store.get(this.id()) : undefined;
    if (existing) {
      this.values.set({ ...existing.values });
      this.previousId = existing.id;
      this.status = existing.status;
    } else {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      this.values.set({
        id_participante: this.store.nextCode(),
        fecha: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        hora_inicio: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      });
    }
    this.index.set(0);
    void p;
  }

  protected visible(f: FieldSpec): boolean {
    return isVisible(f, this.values());
  }

  protected sectionIndex2(p: Protocol, id: string): number {
    return sectionIndex(p, id);
  }

  protected set(key: string, value: FieldValue): void {
    this.values.update((v) => ({ ...v, [key]: value }));
    if (this.errors()[key]) {
      const { [key]: _removed, ...rest } = this.errors();
      this.errors.set(rest);
    }
    this.sectionErrors.set([]);
    this.persist();
  }

  protected setWalkTime(totalSeconds: number): void {
    this.values.update((v) => ({ ...v, c2km_min: Math.floor(totalSeconds / 60), c2km_seg: totalSeconds % 60 }));
    this.persist();
  }

  private persist(): void {
    this.saveError.set(null);
    const v = this.values();
    const code = String(v['id_participante'] ?? '').trim();
    if (!/^P\d{3}$/.test(code)) {
      return; // sin un código válido todavía no se guarda
    }
    const saved = this.store.save(this.previousId, v, this.status);
    if (saved) {
      this.previousId = saved.id;
    } else {
      this.saveError.set(`El código ${code} ya existe. Elige otro para no pisar ese registro.`);
    }
  }

  protected next(): void {
    const sec = this.section();
    const p = this.protocol();
    if (!sec || !p) {
      return;
    }
    const errors = validateSection(sec, this.values());
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    if (sec.id === 'seguridad' && (gatePending(p, this.values()) || gateFailures(p, this.values()).length > 0)) {
      // se muestra la compuerta en el siguiente paso, sin avanzar a las pruebas
      this.index.update((i) => i + 1);
      return;
    }
    this.goTo(this.index() + 1);
  }

  protected back(): void {
    this.goTo(Math.max(0, this.index() - 1));
  }

  protected goTo(i: number): void {
    this.errors.set({});
    this.sectionErrors.set([]);
    this.index.set(Math.max(0, i));
    globalThis.scrollTo?.({ top: 0 });
  }

  protected closeWithoutTests(): void {
    this.status = 'no_continua';
    this.persist();
    void this.router.navigate(['/investigador']);
  }

  protected finish(): void {
    const p = this.protocol();
    if (!p) {
      return;
    }
    const bad: string[] = [];
    let firstBad = -1;
    p.sections.forEach((s, i) => {
      if (s.id !== 'cierre' && Object.keys(validateSection(s, this.values())).length > 0) {
        bad.push(s.title.split(':')[0]);
        if (firstBad < 0) {
          firstBad = i;
        }
      }
    });
    const last = this.section();
    const errs = last ? validateSection(last, this.values()) : {};
    this.errors.set(errs);
    if (gateFailures(p, this.values()).length > 0) {
      this.goTo(sectionIndex(p, p.gate.appliesFromSection));
      return;
    }
    if (bad.length > 0 || Object.keys(errs).length > 0) {
      this.sectionErrors.set(bad);
      return;
    }
    this.status = 'completa';
    this.persist();
    void this.router.navigate(['/investigador']);
  }

  protected fmt(v: number | null | undefined, digits: number): string {
    return v === null || v === undefined ? '—' : v.toFixed(digits);
  }

  protected measureName(key: string): string {
    return MEASURE_NAMES[key] ?? key;
  }

  protected hasPairs(): boolean {
    return Object.values(this.calc()).some((v) => v !== null);
  }
}
