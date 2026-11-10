import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { CloudService } from '../../core/cloud/cloud.service';
import { COMPONENT_INFO } from '../../core/model/component-info';
import { BundleInput, ModelBundle } from '../../core/model/model-bundle.types';
import { ModelBundleService } from '../../core/model/model-bundle.service';
import { ComponentResult, InputErrors, InputValues, computeProfile, hasQuick, requiredInputKeys, validateInputs } from '../../core/model/profile-engine';
import { ProfileEntry, ProfileHistoryService } from '../../core/storage/profile-history.service';
import { DemoBannerComponent } from '../../shared/demo-banner.component';
import { ResultCardComponent } from '../../shared/result-card.component';
import { SignInCardComponent } from '../../shared/sign-in-card.component';
import { TestIconComponent } from '../../shared/test-icon.component';

type Step = 'intro' | 'form' | 'result' | 'history';

const PENDING_KEY = 'capstone.perfil.pendiente';

@Component({
  selector: 'app-perfil-page',
  imports: [RouterLink, ReactiveFormsModule, DatePipe, DemoBannerComponent, ResultCardComponent, SignInCardComponent, TestIconComponent],
  template: `
    <app-demo-banner [isDemo]="bundles.isDemo()" />
    <main class="page">
      <a class="back-link" routerLink="/">← Inicio</a>
      <h1>{{ heading() }}</h1>

      @switch (bundles.state()) {
        @case ('idle') {
          <p class="muted">Cargando…</p>
        }
        @case ('loading') {
          <p class="muted" role="status">Cargando el modelo…</p>
        }
        @case ('rejected') {
          <p class="notice" role="alert">{{ bundles.problem() }}</p>
        }
        @case ('unavailable') {
          <p class="notice" role="note">
            Todavía no hay un modelo validado. Por ahora, cada componente requiere su prueba directa.
          </p>
          <div class="grid">
            @for (c of fallbackCards; track c.key) {
              <article class="card">
                <h3>{{ c.name }}</h3>
                <p><strong>Requiere prueba directa</strong></p>
                <p class="muted">{{ c.directTest }}</p>
              </article>
            }
          </div>
        }
        @case ('ready') {
          @switch (step()) {
            @case ('intro') {
              @if (bundles.bundle()?.manifest?.description; as desc) {
                <p class="notice" [class.info]="!bundles.isDemo()" role="note">
                  {{ desc }}
                  @if (bundles.bundle()?.manifest?.dataSource; as src) { <br />Fuente de los datos: {{ src }} }
                </p>
              }
              <p class="muted">
                Ingresa tus medidas y verás, por separado, qué componentes de tu condición física pueden estimarse con respaldo y cuáles
                todavía requieren la prueba directa. No hay un puntaje total.
              </p>
              <ul class="avail">
                @for (c of availability(); track c.key) {
                  <li>
                    <span class="glyph" [class.off]="!c.ready"><app-test-icon [kind]="c.key" /></span>
                    <span class="name">{{ c.title }}</span>
                    <span class="chip" [class.on]="c.ready">{{ c.ready ? 'Se estima' : 'Prueba directa' }}</span>
                  </li>
                }
              </ul>
              <p class="notice" role="note">
                Esta aplicación no es un diagnóstico médico. Sus resultados son orientativos y se calcularon para adultos de 18 a 40 años.
                Tus medidas se calculan en este teléfono y no se envían a ninguna parte; solo se guardan en la nube si inicias sesión y eliges guardar un perfil.
              </p>
              <div class="actions">
                <button type="button" class="btn" (click)="step.set('form')">Empezar</button>
                <button type="button" class="btn secondary" (click)="step.set('history')">
                  Historial{{ history.available() && history.entries().length > 0 ? ' (' + history.entries().length + ')' : '' }}
                </button>
              </div>
            }
            @case ('form') {
              <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
                <div class="progress-row" aria-live="polite">
                  <progress [max]="visibleKeys().size" [value]="filled()" aria-label="Campos completados"></progress>
                  <span class="muted">{{ filled() }} de {{ visibleKeys().size }}</span>
                </div>
                @if (quickAvailable() && !precise()) {
                  <p class="muted hint">Con estos cuatro datos se calcula una estimación rápida. Todos los campos son obligatorios.</p>
                } @else {
                  <p class="muted hint">Los campos con * son obligatorios.@if (!quickAvailable()) { Si no tienes una medida opcional, déjala vacía: los componentes que la usan pedirán la prueba directa. }</p>
                }
                @for (g of groups(); track g.title) {
                  <fieldset class="card group">
                    <legend>{{ g.title }}</legend>
                    @for (input of g.inputs; track input.key) {
                      <div class="field">
                        @if (input.type === 'sex') {
                          <fieldset>
                            <legend>{{ label(input) }}</legend>
                            <div class="choices" role="radiogroup">
                              <label class="choice"><input type="radio" [formControlName]="input.key" [value]="0" /> Masculino</label>
                              <label class="choice"><input type="radio" [formControlName]="input.key" [value]="1" /> Femenino</label>
                            </div>
                          </fieldset>
                        } @else {
                          <label [for]="'f-' + input.key">{{ label(input) }}</label>
                          <div class="numfield">
                            <input
                              class="input" type="number" inputmode="decimal" step="any"
                              [id]="'f-' + input.key" [formControlName]="input.key"
                              [attr.aria-invalid]="errors()[input.key] ? 'true' : null"
                              [attr.aria-describedby]="'h-' + input.key"
                            />
                            @if (input.unit) {
                              <span class="suffix" aria-hidden="true">{{ input.unit }}</span>
                            }
                          </div>
                        }
                        <small [id]="'h-' + input.key">{{ input.help }}</small>
                        @if (rangeHint(input); as hint) {
                          <small class="range">{{ hint }}</small>
                        }
                        @if (errors()[input.key]; as err) {
                          <small class="error" role="alert">{{ err }}</small>
                        }
                      </div>
                    }
                  </fieldset>
                }
                @if (quickAvailable()) {
                  @if (!precise()) {
                    <button type="button" class="btn secondary precise" (click)="openPrecise()">¿Medición más precisa?</button>
                  } @else {
                    <button type="button" class="btn secondary precise" (click)="closePrecise()">Volver a la medición rápida</button>
                  }
                }
                <div class="actions stretch sticky">
                  <button type="submit" class="btn">Ver mi perfil</button>
                  <button type="button" class="btn secondary" (click)="step.set('intro')">Volver</button>
                </div>
              </form>
            }
            @case ('result') {
              <p class="muted summary">
                <strong>{{ estimated() }}</strong> {{ estimated() === 1 ? 'componente estimado' : 'componentes estimados' }}
                · <strong>{{ results().length - estimated() }}</strong> {{ results().length - estimated() === 1 ? 'requiere' : 'requieren' }} prueba directa.
                Cada tarjeta es independiente: no existe un puntaje total.
              </p>
              @if (quickMode()) {
                <p class="notice info" role="note">
                  Estimación rápida con peso, talla, edad y sexo: es aproximada. Con las circunferencias el error baja.
                </p>
                <div class="actions stretch">
                  <button type="button" class="btn secondary" (click)="openPrecise(); step.set('form')">¿Medición más precisa?</button>
                </div>
              }
              @if (estimatedResults().length > 0) {
                <div class="grid">
                  @for (r of estimatedResults(); track r.key) {
                    <app-result-card [result]="r" [isDemo]="bundles.isDemo()" />
                  }
                </div>
              }
              @if (directResults().length > 0) {
                <details class="direct-group">
                  <summary>
                    <div>
                      <span>{{ directResults().length === 1 ? 'Requiere prueba directa' : 'Requieren prueba directa' }} ({{ directResults().length }})</span>
                      <small>Toca para ver por qué</small>
                    </div>
                  </summary>
                  <div class="grid">
                    @for (r of directResults(); track r.key) {
                      <app-result-card [result]="r" [isDemo]="bundles.isDemo()" />
                    }
                  </div>
                </details>
              }
              @if (!history.available() && cloud.configured) {
                <app-sign-in-card
                  heading="Guarda este perfil"
                  text="Tu resultado ya está listo y no necesita cuenta. Si ingresas o te registras, puedes guardarlo en tu historial y compararlo después."
                  (leaving)="remember()"
                />
              }
              <div class="actions stretch result-actions" [class.single]="!history.available()">
                @if (history.available()) {
                  @if (!saved()) {
                    <button type="button" class="btn" (click)="save()">Guardar en mi historial</button>
                  } @else {
                    <span class="badge ok" role="status">Guardado en tu historial</span>
                  }
                }
                <button type="button" class="btn secondary" (click)="step.set('form')">Cambiar medidas</button>
                <button type="button" class="btn secondary" (click)="step.set('history')">Historial</button>
              </div>
            }
            @case ('history') {
              @if (!history.available()) {
                <p class="muted">
                  El historial se guarda en tu cuenta. Ingresa para verlo; hacer la prueba no la necesita.
                </p>
                <app-sign-in-card heading="Ingresa para ver tu historial" text="Tus perfiles guardados aparecen aquí, en cualquier dispositivo donde ingreses con tu cuenta." (leaving)="remember()" />
              } @else if (history.loading()) {
                <p class="muted" role="status">Cargando tu historial…</p>
              } @else if (history.entries().length === 0) {
                <p class="muted">Todavía no guardaste ningún perfil.</p>
              } @else {
                <div class="grid">
                  @for (e of history.entries(); track e.id) {
                    <article class="card">
                      <h3>{{ e.createdAt | date: 'd MMM y, HH:mm' }}
                        @if (e.isDemo) { <span class="badge warn">DEMOSTRACIÓN</span> }
                      </h3>
                      <ul>
                        @for (r of e.results; track r.key) {
                          <li>
                            {{ r.name }}:
                            @if (r.status === 'value') { <strong>{{ format(r) }}</strong> } @else { <em>Requiere prueba directa</em> }
                          </li>
                        }
                      </ul>
                      <button type="button" class="btn danger" (click)="history.remove(e.id)">Borrar</button>
                    </article>
                  }
                </div>
                <div class="actions">
                  <button type="button" class="btn danger" (click)="clearAll()">Borrar todo el historial</button>
                </div>
              }
              @if (history.error()) {
                <p class="notice error" role="alert">{{ history.error() }}</p>
              }
              <div class="actions">
                <button type="button" class="btn" (click)="step.set('form')">Nueva consulta</button>
              </div>
            }
          }
        }
      }
    </main>
  `,
  styles: `
    ul { padding-left: var(--space-5); margin: 0 0 var(--space-3); }
    .form { display: grid; gap: var(--space-4); }
    .form > p, .form .field { margin: 0; }
    .range { color: var(--color-text-muted); }
    .progress-row { display: grid; grid-template-columns: 1fr auto; gap: var(--space-3); align-items: center; }
    .hint { font-size: 0.9rem; }
    .group { display: grid; gap: var(--space-4); padding: var(--space-5) var(--space-4) var(--space-4); }
    .group > legend { float: left; width: 100%; padding: 0; margin: 0 0 var(--space-4); font-size: 0.8rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-muted); }
    .group > legend + * { clear: both; }
    .numfield { position: relative; }
    .numfield .input { padding-right: 3.4rem; font-size: 1.35rem; font-weight: 600; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
    .suffix { position: absolute; right: var(--space-3); top: 50%; transform: translateY(-50%); color: var(--color-text-muted); font-weight: 600; pointer-events: none; }
    .avail { list-style: none; padding: 0 var(--space-4); margin: 0; background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
    .avail li { display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-3); align-items: center; padding: var(--space-3) 0; border-bottom: 0.5px solid var(--color-border); }
    .avail li:last-child { border-bottom: 0; }
    .avail .name { font-weight: 600; }
    .glyph { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 13px; background: var(--glyph-bg); color: var(--glyph-fg); }
    .glyph.off { background: var(--color-surface-alt); color: var(--color-text-muted); }
    .summary { font-size: 1.02rem; }
    .precise { width: 100%; }
    .result-actions > :first-child { flex-basis: 100%; }
    .result-actions.single > :first-child { flex-basis: 140px; }
    .result-actions .badge { display: grid; place-items: center; min-height: 54px; font-size: 0.95rem; border-radius: var(--radius-md); }
    .direct-group { background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: 0 var(--space-4); }
    .direct-group[open] { padding-bottom: var(--space-4); }
    .direct-group > summary { min-height: 64px; padding: var(--space-3) 0; }
    .direct-group > summary div { display: grid; gap: 2px; }
    .direct-group > summary span { font-weight: 700; color: var(--color-text); }
    .direct-group > summary small { color: var(--color-text-muted); font-weight: 400; }
    .direct-group > .grid { margin-top: var(--space-2); }
  `,
})
export class PerfilPage {
  /** `?paso=historial` abre directamente el historial (enlace desde Cuenta). */
  readonly paso = input<string | undefined>(undefined);

  protected readonly bundles = inject(ModelBundleService);
  protected readonly history = inject(ProfileHistoryService);
  protected readonly cloud = inject(CloudService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly fallbackCards = COMPONENT_INFO;
  protected readonly step = signal<Step>('intro');
  protected readonly results = signal<ComponentResult[]>([]);
  protected readonly errors = signal<InputErrors>({});
  protected readonly saved = signal(false);
  protected readonly inputs = computed<BundleInput[]>(() => this.bundles.bundle()?.inputs ?? []);
  protected form = new FormGroup<Record<string, FormControl<number | null>>>({});
  protected readonly filled = signal(0);
  /** La medición más precisa pide además las circunferencias; la rápida solo peso, talla, edad y sexo. */
  protected readonly precise = signal(false);
  protected readonly quickAvailable = computed(() => {
    const b = this.bundles.bundle();
    return !!b && hasQuick(b);
  });
  protected readonly quickMode = computed(() => this.results().some((r) => r.mode === 'rapida'));
  protected readonly visibleKeys = computed(() => {
    const b = this.bundles.bundle();
    if (!b) {
      return new Set<string>();
    }
    return this.quickAvailable() ? requiredInputKeys(b, this.precise()) : new Set(b.inputs.map((i) => i.key));
  });
  protected readonly estimated = computed(() => this.results().filter((r) => r.status === 'value').length);
  protected readonly estimatedResults = computed(() => this.results().filter((r) => r.status === 'value'));
  protected readonly directResults = computed(() => this.results().filter((r) => r.status === 'direct'));
  protected readonly heading = computed(() => ({ intro: 'Mi perfil físico', form: 'Tus medidas', result: 'Tu perfil', history: 'Historial' })[this.step()]);

  /** Las entradas se agrupan como se toman: primero lo que se pesa y se mide de pie, luego lo que se mide con cinta. */
  protected readonly groups = computed(() => {
    const body = new Set(['peso_kg_prom', 'talla_cm_prom', 'edad_anios', 'sexo_f']);
    const all = this.inputs();
    const showTape = !this.quickAvailable() || this.precise();
    return [
      { title: 'Tu cuerpo', inputs: all.filter((i) => body.has(i.key)) },
      { title: 'Circunferencias con cinta', inputs: showTape ? all.filter((i) => !body.has(i.key)) : [] },
    ].filter((g) => g.inputs.length > 0);
  });

  protected readonly availability = computed(() =>
    (this.bundles.bundle()?.components ?? []).map((c) => ({ key: c.key, title: c.name.replace(/\s*\(.*\)\s*/, ''), ready: c.meetsCriteria })),
  );
  private required = new Set<string>();
  private attempted = false;
  private lastValues: InputValues = {};

  constructor() {
    void this.bundles.load().then(() => {
      this.buildForm(this.bundles.bundle());
      this.restorePending();
    });
    void this.cloud.start();
    effect(() => {
      if (this.paso() === 'historial') {
        this.step.set('history');
      }
    });
  }

  /** Rango de esa medida en los participantes con que se entrenó el modelo, para saber de antemano si tus medidas caben. */
  protected rangeHint(input: BundleInput): string | null {
    const ranges = (this.bundles.bundle()?.components ?? []).map((c) => c.trainRange?.[input.key]).filter((r): r is [number, number] => !!r);
    if (ranges.length === 0 || input.type === 'sex') {
      return null;
    }
    const lo = Math.min(...ranges.map((r) => r[0]));
    const hi = Math.max(...ranges.map((r) => r[1]));
    const f = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
    const unit = input.unit ? ` ${input.unit}` : '';
    return `Rango del estudio: ${f(lo)} a ${f(hi)}${unit}.`;
  }

  /** Antes de ir a Ingresar se guarda lo escrito, para mostrar el mismo resultado al volver sin pedir las medidas otra vez. */
  protected remember(): void {
    if (this.step() === 'result') {
      try {
        globalThis.sessionStorage?.setItem(PENDING_KEY, JSON.stringify({ values: this.lastValues, precise: this.precise() }));
      } catch {
        // sin sessionStorage la persona vuelve a escribir sus medidas
      }
    }
  }

  private restorePending(): void {
    const bundle = this.bundles.bundle();
    let raw: string | null = null;
    try {
      raw = globalThis.sessionStorage?.getItem(PENDING_KEY) ?? null;
      globalThis.sessionStorage?.removeItem(PENDING_KEY);
    } catch {
      return;
    }
    if (!raw || !bundle || this.paso() === 'historial') {
      return;
    }
    try {
      const saved = JSON.parse(raw) as { values: InputValues; precise: boolean };
      this.precise.set(!!saved.precise);
      this.refreshMode();
      this.form.patchValue(saved.values as Record<string, number | null>);
      this.lastValues = saved.values;
      this.results.set(computeProfile(bundle, saved.values));
      this.saved.set(false);
      this.step.set('result');
    } catch {
      // datos dañados: se ignora y la persona empieza de nuevo
    }
  }

  protected label(input: BundleInput): string {
    return `${input.label}${this.required.has(input.key) ? ' *' : ''}`;
  }

  private buildForm(bundle: ModelBundle | null): void {
    if (!bundle) {
      return;
    }
    this.required = requiredInputKeys(bundle, !hasQuick(bundle) || this.precise());
    const group = new FormGroup<Record<string, FormControl<number | null>>>({});
    for (const i of bundle.inputs) {
      group.addControl(i.key, new FormControl<number | null>(null));
    }
    // Después del primer intento de envío, los errores se actualizan mientras la persona corrige.
    group.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.attempted) {
        this.errors.set(validateInputs(bundle.inputs, group.getRawValue(), this.required));
      }
    });
    this.form = group;
    this.filled.set(0);
    group.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.countFilled());
  }

  private countFilled(): void {
    const raw = this.form.getRawValue();
    this.filled.set([...this.visibleKeys()].filter((k) => raw[k] !== null && raw[k] !== undefined && !Number.isNaN(raw[k])).length);
  }

  protected openPrecise(): void {
    this.precise.set(true);
    this.refreshMode();
  }

  protected closePrecise(): void {
    this.precise.set(false);
    this.refreshMode();
  }

  private refreshMode(): void {
    const bundle = this.bundles.bundle();
    if (bundle) {
      this.required = requiredInputKeys(bundle, !hasQuick(bundle) || this.precise());
      this.errors.set({});
      this.attempted = false;
      this.countFilled();
    }
  }

  protected submit(): void {
    const bundle = this.bundles.bundle();
    if (!bundle) {
      return;
    }
    const raw: InputValues = this.form.getRawValue();
    // en la medición rápida solo cuentan las cuatro medidas básicas, aunque haya circunferencias escritas antes
    const values: InputValues = this.quickAvailable() && !this.precise() ? Object.fromEntries(Object.entries(raw).filter(([k]) => this.visibleKeys().has(k))) : raw;
    this.attempted = true;
    const errors = validateInputs(bundle.inputs, values, this.required);
    this.errors.set(errors);
    const first = Object.keys(errors)[0];
    if (first) {
      (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(`#f-${first}, [formcontrolname="${first}"]`)?.focus();
      return;
    }
    this.lastValues = values;
    this.results.set(computeProfile(bundle, values));
    this.saved.set(false);
    this.step.set('result');
  }

  protected save(): void {
    const bundle = this.bundles.bundle();
    if (!bundle) {
      return;
    }
    const entry: Omit<ProfileEntry, 'id' | 'createdAt'> = {
      bundleVersion: bundle.manifest.bundleVersion,
      isDemo: bundle.manifest.isDemo,
      inputs: this.lastValues,
      results: this.results().map(({ key, name, unit, status, value, reason }) => ({ key, name, unit, status, value, reason })),
    };
    if (this.history.add(entry)) {
      this.saved.set(true);
    }
  }

  protected clearAll(): void {
    if (globalThis.confirm('¿Borrar todo tu historial? Esta acción no se puede deshacer.')) {
      void this.history.clear();
    }
  }

  protected format(r: ProfileEntry['results'][number]): string {
    const d = r.unit === 's' ? 0 : 1;
    return `${(r.value ?? 0).toFixed(d).replace('.', ',')} ${r.unit}`;
  }
}
