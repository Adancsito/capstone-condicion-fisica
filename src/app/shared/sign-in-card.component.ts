import { Component, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CloudService } from '../core/cloud/cloud.service';

/**
 * Invitación a ingresar o registrarse. Hacer la prueba nunca depende de esto: solo guardar el historial (modo Perfil). Lleva a las
 * vistas Ingresar y Registrarse y, al terminar, vuelve a la pantalla de donde salió.
 */
@Component({
  selector: 'app-sign-in-card',
  imports: [RouterLink],
  template: `
    @if (cloud.configured) {
      <section class="card signin" [attr.aria-label]="heading()">
        <h2>{{ heading() }}</h2>
        <p class="muted">{{ text() }}</p>
        <div class="actions stretch">
          <a class="btn" routerLink="/ingresar" [queryParams]="{ volver: router.url }" (click)="leaving.emit()">Ingresar</a>
          <a class="btn secondary" routerLink="/registro" [queryParams]="{ volver: router.url }" (click)="leaving.emit()">Registrarse</a>
        </div>
      </section>
    }
  `,
  styles: `
    .signin { display: grid; gap: var(--space-3); }
    .signin > * { margin: 0; }
    h2 { font-size: 1.2rem; }
  `,
})
export class SignInCardComponent {
  protected readonly cloud = inject(CloudService);
  protected readonly router = inject(Router);
  readonly heading = input('Ingresa para guardar');
  readonly text = input('Hacer la prueba no requiere cuenta. Con una cuenta puedes guardar tu historial y verlo después.');
  /** Se emite justo antes de salir hacia Ingresar o Registrarse, para que la pantalla guarde lo que no quiera perder. */
  readonly leaving = output<void>();
}
