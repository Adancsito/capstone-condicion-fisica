import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CloudService } from '../../core/cloud/cloud.service';

/**
 * Solicitud para ser investigador. El modo Investigador es para el equipo del estudio: quien lo pide queda en una lista y se aprueba
 * a mano en Firebase. Hasta entonces no ve nada de ese modo.
 */
@Component({
  selector: 'app-solicitud-page',
  imports: [RouterLink],
  template: `
    <main class="page">
      <a class="back-link" routerLink="/cuenta">← Cuenta</a>
      <h1>Modo Investigador</h1>

      @if (cloud.isInvestigator()) {
        <section class="card stack">
          <h2>Tu cuenta ya es de investigador</h2>
          <p class="muted">Puedes registrar sesiones de medición y respaldarlas en la nube.</p>
          <a class="btn" routerLink="/investigador">Ir a las sesiones de medición</a>
        </section>
      } @else if (cloud.request() === 'desconocido') {
        <p class="muted" role="status">Revisando tu cuenta…</p>
      } @else if (cloud.request() === 'pendiente') {
        <section class="card stack">
          <span class="chip">Solicitud enviada</span>
          <h2>Estamos revisando tu solicitud</h2>
          <p class="muted">
            Quien administra el estudio aprueba las cuentas de investigador a mano. Cuando la tuya se apruebe, el modo Investigador aparecerá
            aquí y en la barra de abajo, sin que tengas que hacer nada más.
          </p>
        </section>
      } @else {
        <p class="lead">
          Este modo es para el equipo que registra las mediciones del estudio. Si formas parte, cuéntanos quién eres y la persona que administra el
          estudio revisará tu solicitud.
        </p>
        <form class="card form" (submit)="send($event)" novalidate>
          <div class="field">
            <label for="s-nombre">Nombre</label>
            <input id="s-nombre" class="input" type="text" autocomplete="name" [value]="nombre()" (input)="nombre.set($any($event.target).value)" />
          </div>
          <div class="field">
            <label for="s-inst">Institución o rol</label>
            <input id="s-inst" class="input" type="text" [value]="institucion()" (input)="institucion.set($any($event.target).value)" />
            <small>Por ejemplo: evaluador del estudio, tesista, asistente.</small>
          </div>
          <div class="field">
            <label for="s-motivo">¿Para qué necesitas el modo Investigador?</label>
            <textarea id="s-motivo" class="input area" rows="4" [value]="motivo()" (input)="motivo.set($any($event.target).value)"></textarea>
            @if (error()) { <small class="error" role="alert">{{ error() }}</small> }
          </div>
          @if (cloud.error()) {
            <p class="notice error" role="alert">{{ cloud.error() }}</p>
          }
          <button type="submit" class="btn" [disabled]="cloud.busy()">{{ cloud.busy() ? 'Enviando…' : 'Enviar solicitud' }}</button>
        </form>
      }
    </main>
  `,
  styles: `
    .stack > * { margin: 0; }
    .stack { display: grid; gap: var(--space-3); justify-items: start; }
    .form { display: grid; gap: var(--space-4); }
    .form .field { margin: 0; }
    .area { min-height: 110px; padding: var(--space-3) var(--space-4); resize: vertical; }
  `,
})
export class SolicitudPage {
  protected readonly cloud = inject(CloudService);
  protected readonly nombre = signal(this.cloud.user()?.name ?? '');
  protected readonly institucion = signal('');
  protected readonly motivo = signal('');
  protected readonly error = signal('');
  protected readonly ready = computed(() => this.motivo().trim().length >= 10);

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.ready()) {
      this.error.set('Cuéntanos en una o dos frases para qué lo necesitas.');
      return;
    }
    this.error.set('');
    await this.cloud.requestInvestigator({
      nombre: this.nombre() || (this.cloud.user()?.name ?? ''),
      institucion: this.institucion(),
      motivo: this.motivo(),
    });
  }
}
