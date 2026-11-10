import { Component, inject } from '@angular/core';

import { PwaService } from '../core/pwa/pwa.service';

/** Invitación a instalar la aplicación: botón en Android y escritorio, instrucciones en iPhone. Desaparece si ya está instalada. */
@Component({
  selector: 'app-install-card',
  template: `
    @if (pwa.showInstall()) {
      <section class="install card" aria-label="Instalar la aplicación">
        <span class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
            <path d="M5 19h14" />
          </svg>
        </span>
        <div class="text">
          <h2>Instala la aplicación</h2>
          @if (pwa.canPrompt()) {
            <p class="muted">Queda en tu pantalla de inicio, se abre sin la barra del navegador y funciona sin conexión.</p>
          } @else {
            <p class="muted">
              En Safari toca <strong>Compartir</strong>
              <svg class="share" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 15V4M8 8l4-4 4 4" /><path d="M6 12v7h12v-7" />
              </svg>
              y luego <strong>Añadir a pantalla de inicio</strong>.
            </p>
          }
          <div class="actions">
            @if (pwa.canPrompt()) {
              <button type="button" class="btn" (click)="pwa.install()">Instalar</button>
            }
            <button type="button" class="btn secondary" (click)="pwa.hideInstall()">Ahora no</button>
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    .install { display: grid; grid-template-columns: auto 1fr; gap: var(--space-4); align-items: start; padding: var(--space-4); }
    .icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; background: var(--glyph-bg); color: var(--glyph-fg); }
    h2 { margin: 0 0 var(--space-1); font-size: 1.1rem; }
    p { margin: 0 0 var(--space-3); font-size: 0.92rem; }
    .share { vertical-align: -3px; }
    .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .actions .btn { min-height: 44px; padding: 0 var(--space-4); }
  `,
})
export class InstallCardComponent {
  protected readonly pwa = inject(PwaService);
}
