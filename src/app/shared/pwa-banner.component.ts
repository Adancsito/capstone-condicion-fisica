import { Component, inject } from '@angular/core';

import { PwaService } from '../core/pwa/pwa.service';

/** Avisos de la PWA: sin conexión y versión nueva lista. Flotan sobre el contenido sin mover la pantalla. */
@Component({
  selector: 'app-pwa-banner',
  template: `
    @if (!pwa.online()) {
      <p class="offline" role="status">Sin conexión. Puedes seguir usando la aplicación.</p>
    }
    @if (pwa.updateReady()) {
      <div class="update" role="alert">
        <span>Hay una versión nueva de la aplicación.</span>
        <button type="button" class="btn small" (click)="pwa.applyUpdate()">Actualizar</button>
      </div>
    }
  `,
  styles: `
    :host { display: contents; }
    .offline {
      position: fixed;
      z-index: 50;
      top: calc(var(--topbar-h) + env(safe-area-inset-top) + 6px);
      left: 50%;
      transform: translateX(-50%);
      margin: 0;
      max-width: calc(100% - 32px);
      padding: 6px 14px;
      border-radius: 999px;
      background: var(--color-text);
      color: var(--color-bg);
      font-size: 0.82rem;
      font-weight: 600;
      text-align: center;
      box-shadow: 0 4px 16px rgb(0 0 0 / 22%);
    }
    .update {
      position: fixed;
      z-index: 60;
      left: var(--space-4);
      right: var(--space-4);
      bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--space-3));
      max-width: 460px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--color-text);
      color: var(--color-bg);
      font-size: 0.92rem;
      font-weight: 600;
      box-shadow: 0 8px 28px rgb(0 0 0 / 30%);
    }
    .update .btn { background: var(--color-bg); color: var(--color-text); min-height: 40px; }
    @media (min-width: 760px) {
      .update { bottom: var(--space-4); }
    }
  `,
})
export class PwaBannerComponent {
  protected readonly pwa = inject(PwaService);
}
