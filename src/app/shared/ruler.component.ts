import { Component, computed, input } from '@angular/core';

import { LevelSpec } from '../core/model/model-bundle.types';

/**
 * Regla de un componente: la banda es el rango medido en el estudio (referencia descriptiva, no una norma) y la marca es la estimación.
 * Si hay puntos de corte válidos (`levels`), la banda se divide en sus niveles. Sin valor, la regla queda vacía: se pide la prueba directa.
 */
@Component({
  selector: 'app-ruler',
  template: `
    <div class="ruler" role="img" [attr.aria-label]="aria()">
      <div class="track">
        @if (band(); as b) {
          <div class="band" [style.left.%]="b.from" [style.width.%]="b.to - b.from"></div>
          @for (s of segments(); track s.label) {
            <div class="seg" [style.left.%]="s.from" [style.width.%]="s.to - s.from"><span>{{ s.label }}</span></div>
          }
        }
        @if (zero() !== null) {
          <span class="zero" [style.left.%]="zero()"></span>
        }
        @if (marker() !== null) {
          <span class="marker" [style.left.%]="marker()"></span>
        }
      </div>
      @if (band(); as b) {
        <div class="ends">
          <span [style.left.%]="b.from">{{ fmt(range()![0]) }}</span>
          <span [style.left.%]="b.to">{{ fmt(range()![1]) }} {{ unit() }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .ruler {
      --pad: 14px;
      padding: 0 var(--pad);
    }
    .track {
      position: relative;
      height: 34px;
      background:
        repeating-linear-gradient(to right, var(--color-scale) 0 1px, transparent 1px 5%) bottom / 100% 9px no-repeat,
        repeating-linear-gradient(to right, var(--color-scale) 0 2px, transparent 2px 25%) bottom / 100% 16px no-repeat;
      border-bottom: 2px solid var(--color-scale);
    }
    .band {
      position: absolute;
      top: 4px;
      bottom: 0;
      background: var(--color-surface-alt);
      border-radius: 4px 4px 0 0;
      opacity: 0.9;
    }
    .seg {
      position: absolute;
      top: 4px;
      bottom: 0;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--color-text-muted);
      border-left: 1px dashed var(--color-scale);
    }
    .zero {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 0;
      border-left: 2px dotted var(--color-text-muted);
    }
    .marker {
      position: absolute;
      top: -2px;
      bottom: -2px;
      width: 4px;
      margin-left: -2px;
      border-radius: 2px;
      background: var(--color-text);
      box-shadow: 0 0 0 3px var(--color-surface);
    }
    .marker::before {
      content: '';
      position: absolute;
      top: -6px;
      left: 50%;
      margin-left: -6px;
      border: 6px solid transparent;
      border-top: 7px solid var(--color-text);
      border-bottom: 0;
    }
    .ends {
      position: relative;
      height: 1.4rem;
      margin-top: 6px;
      font-size: 0.78rem;
      color: var(--color-text-muted);
    }
    .ends span {
      position: absolute;
      white-space: nowrap;
    }
    .ends span:first-child {
      transform: translateX(-50%);
    }
    .ends span:last-child {
      transform: translateX(-60%);
    }
  `,
})
export class RulerComponent {
  readonly value = input<number | null>(null);
  readonly range = input<[number, number] | null>(null);
  readonly unit = input('');
  readonly decimals = input(1);
  readonly levels = input<LevelSpec | null>(null);

  /** Dominio de la regla: el rango observado con un margen, para que la banda no toque los bordes. */
  private readonly domain = computed<[number, number] | null>(() => {
    const r = this.range();
    if (!r || r[1] <= r[0]) {
      return null;
    }
    const pad = (r[1] - r[0]) * 0.18;
    const v = this.value();
    const lo = Math.min(r[0], v ?? r[0]) - pad;
    const hi = Math.max(r[1], v ?? r[1]) + pad;
    return [lo, hi];
  });

  private pct(x: number): number {
    const d = this.domain()!;
    return Math.min(100, Math.max(0, ((x - d[0]) / (d[1] - d[0])) * 100));
  }

  protected readonly band = computed(() => {
    const r = this.range();
    return this.domain() && r ? { from: this.pct(r[0]), to: this.pct(r[1]) } : null;
  });

  protected readonly marker = computed(() => {
    const v = this.value();
    return this.domain() && v !== null ? this.pct(v) : null;
  });

  /** En el sit-and-reach el cero es la línea de los pies: se marca cuando la regla pasa por él. */
  protected readonly zero = computed(() => {
    const d = this.domain();
    return d && d[0] < 0 && d[1] > 0 ? this.pct(0) : null;
  });

  protected readonly segments = computed(() => {
    const l = this.levels();
    const r = this.range();
    if (!l || !r || !this.domain()) {
      return [];
    }
    const cuts = [r[0], l.cutoffs[0], l.cutoffs[1], r[1]];
    return l.labels.map((label, i) => ({ label, from: this.pct(cuts[i]), to: this.pct(cuts[i + 1]) }));
  });

  protected fmt(x: number): string {
    return x.toFixed(this.decimals()).replace('.', ',');
  }

  protected readonly aria = computed(() => {
    const r = this.range();
    const v = this.value();
    const ref = r ? `Valores medidos en el estudio: de ${this.fmt(r[0])} a ${this.fmt(r[1])} ${this.unit()}.` : '';
    return v === null ? ref : `Estimación: ${this.fmt(v)} ${this.unit()}. ${ref}`;
  });
}
