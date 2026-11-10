import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { ComponentResult, decimalsFor } from '../core/model/profile-engine';
import { RulerComponent } from './ruler.component';
import { TestIconComponent } from './test-icon.component';

/** Tarjeta independiente de un componente: valor continuo en su unidad nativa sobre su regla, o la petición de la prueba directa. */
@Component({
  selector: 'app-result-card',
  imports: [DecimalPipe, RulerComponent, TestIconComponent],
  template: `
    <article class="strip result" [class.direct]="result().status === 'direct'" [attr.aria-label]="title()">
      <header>
        <span class="glyph"><app-test-icon [kind]="result().key" /></span>
        <div>
          <h3>{{ title() }}</h3>
          @if (subtitle()) {
            <p class="muted sub">{{ subtitle() }}</p>
          }
        </div>
      </header>

      @if (result().status === 'value') {
        <p class="figure" data-testid="value">
          <span class="num">{{ result().value | number: format() }}</span>
          <span class="unit">{{ result().unit }}</span>
          <span class="tag">{{ result().mode === 'rapida' ? 'Estimación rápida' : 'Estimación' }}</span>
        </p>
        @if (result().evidence === 'limitada') {
          <p class="notice info" role="note">Evidencia limitada: al repetir la validación con otras personas, la ventaja de este modelo sobre la regresión de peso y talla podría no sostenerse.</p>
        }
        @if (result().level) {
          <p class="level"><span class="badge ok">Nivel: {{ result().level }}</span></p>
        }
        @if (isDemo()) {
          <p><span class="badge warn">DEMOSTRACIÓN</span></p>
        }
        <app-ruler [value]="result().value" [range]="result().observedRange" [unit]="result().unit" [decimals]="decimals()" [levels]="result().levelSpec" />
        @if (result().observedRange) {
          <p class="muted caption">La banda muestra los valores medidos en el estudio. Sirve de referencia, no es una norma.</p>
        }
        <details>
          <summary>Cómo se calculó</summary>
          @if (result().metrics; as m) {
            <p class="muted">
              Modelo: {{ result().family }}{{ result().mode === 'rapida' ? ' con peso, talla, edad y sexo' : '' }}. Al validarlo con personas que no vio, se equivocó en promedio
              {{ m.mae | number: '1.1-2' }} {{ result().unit }}; la línea de base se equivocó {{ m.baselineMae | number: '1.1-2' }}.
              R²: {{ m.r2 | number: '1.2-2' }}. Entrenado con {{ m.n }} participantes. {{ m.validation }}.
            </p>
          }
          @if (result().mode === 'rapida' && result().fullMae !== null) {
            <p class="muted">Es una estimación aproximada. Con las circunferencias, el error medio baja a {{ result().fullMae | number: '1.1-2' }} {{ result().unit }}.</p>
          }
          <p class="muted">Para medirlo directamente: {{ result().directTest }}</p>
        </details>
      } @else {
        <p class="figure direct-title" data-testid="direct">Requiere prueba directa</p>
        <app-ruler [range]="result().observedRange" [unit]="result().unit" [decimals]="decimals()" />
        <p class="muted">{{ result().reason }}</p>
        <p class="muted"><strong>Cómo se mide:</strong> {{ result().directTest }}</p>
      }
    </article>
  `,
  styles: `
    .strip {
      display: grid;
      gap: var(--space-3);
      align-content: start;
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-card);
      padding: var(--space-5) var(--space-4) var(--space-3);
    }
    .strip > * {
      margin: 0;
    }
    .strip.direct {
      background: var(--color-surface);
    }
    header {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-3);
      align-items: center;
    }
    .glyph {
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      border-radius: 14px;
      background: var(--glyph-bg);
      color: var(--glyph-fg);
    }
    .direct .glyph {
      background: var(--color-surface-alt);
      color: var(--color-text-muted);
    }
    h3 {
      margin: 0;
      font-size: 1.2rem;
    }
    .sub {
      margin: 2px 0 0;
      font-size: 0.85rem;
    }
    .figure {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 var(--space-2);
    }
    .num {
      font-family: var(--font-display);
      font-size: 3.5rem;
      font-weight: 700;
      letter-spacing: -0.04em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .unit {
      font-size: 1.3rem;
      font-weight: 600;
      color: var(--color-text-muted);
    }
    .tag {
      margin-left: auto;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--color-marker-soft);
      font-size: 0.74rem;
      font-weight: 700;
      color: var(--color-ok);
    }
    .direct-title {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--color-text-muted);
    }
    .caption {
      font-size: 0.82rem;
    }
    details {
      border-top: 0.5px solid var(--color-border);
    }
  `,
})
export class ResultCardComponent {
  readonly result = input.required<ComponentResult>();
  readonly isDemo = input(false);
  protected readonly decimals = computed(() => decimalsFor(this.result().unit));
  protected readonly format = computed(() => `1.${this.decimals()}-${this.decimals()}`);

  /** El nombre trae entre paréntesis cómo se mide; se separa para poner primero lo que el usuario reconoce. */
  protected readonly title = computed(() => this.result().name.replace(/\s*\(.*\)\s*/, ''));
  protected readonly subtitle = computed(() => /\((.*)\)/.exec(this.result().name)?.[1] ?? '');
}
