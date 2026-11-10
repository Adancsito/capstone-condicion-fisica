import { Component, OnDestroy, computed, output, signal } from '@angular/core';

/** Cronómetro de apoyo para el sostén del tronco y la caminata de 2 km. Entrega los segundos enteros al pulsar "Usar". */
@Component({
  selector: 'app-stopwatch',
  template: `
    <div class="card sw" role="group" aria-label="Cronómetro">
      <p class="time" aria-live="off">{{ display() }}</p>
      <div class="actions">
        @if (!running()) {
          <button type="button" class="btn" (click)="start()">{{ elapsedMs() > 0 ? 'Seguir' : 'Iniciar' }}</button>
        } @else {
          <button type="button" class="btn" (click)="stop()">Detener</button>
        }
        <button type="button" class="btn secondary" (click)="reset()" [disabled]="elapsedMs() === 0 && !running()">Reiniciar</button>
        <button type="button" class="btn secondary" (click)="use()" [disabled]="running() || elapsedMs() === 0">Usar este tiempo</button>
      </div>
    </div>
  `,
  styles: `
    .sw { margin: var(--space-2) 0 var(--space-4); }
    .time { font-size: 2.2rem; font-weight: 700; font-variant-numeric: tabular-nums; margin: 0; }
    .actions { margin: var(--space-3) 0 0; }
  `,
})
export class StopwatchComponent implements OnDestroy {
  readonly used = output<number>();
  protected readonly running = signal(false);
  protected readonly elapsedMs = signal(0);
  private startedAt = 0;
  private base = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly display = computed(() => {
    const total = Math.floor(this.elapsedMs() / 100) / 10;
    const m = Math.floor(total / 60);
    const s = total - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
  });

  protected start(): void {
    this.startedAt = Date.now();
    this.running.set(true);
    this.timer = setInterval(() => this.elapsedMs.set(this.base + Date.now() - this.startedAt), 100);
  }

  protected stop(): void {
    this.clear();
    this.base += Date.now() - this.startedAt;
    this.elapsedMs.set(this.base);
    this.running.set(false);
  }

  protected reset(): void {
    this.clear();
    this.base = 0;
    this.elapsedMs.set(0);
    this.running.set(false);
  }

  protected use(): void {
    this.used.emit(Math.round(this.elapsedMs() / 1000));
  }

  private clear(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  ngOnDestroy(): void {
    this.clear();
  }
}
