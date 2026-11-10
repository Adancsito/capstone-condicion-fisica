import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CloudService } from '../../core/cloud/cloud.service';
import { ProfileHistoryService } from '../../core/storage/profile-history.service';
import { InstallCardComponent } from '../../shared/install-card.component';

/** Cuenta de la persona: qué se guarda, cerrar sesión, borrar sus perfiles y el acceso al modo Investigador (solo si se aprobó a mano). */
@Component({
  selector: 'app-cuenta-page',
  imports: [RouterLink, InstallCardComponent],
  template: `
    <main class="page">
      <h1>Cuenta</h1>

      @if (cloud.user(); as u) {
        <section class="card who" aria-label="Tu cuenta">
          <span class="avatar" aria-hidden="true">
            @if (u.photo) {
              <img [src]="u.photo" alt="" referrerpolicy="no-referrer" width="56" height="56" />
            } @else {
              {{ initial() }}
            }
          </span>
          <div class="id">
            <strong>{{ u.name || 'Sin nombre' }}</strong>
            <span class="muted">{{ u.email }}</span>
          </div>
          <span class="chip on">Conectado</span>
        </section>

        @if (!u.emailVerified && u.email) {
          <div class="notice" role="note">
            <p>Falta verificar tu correo. Te enviamos un mensaje al crear la cuenta.</p>
            <button type="button" class="btn small secondary" (click)="cloud.resendVerification()" [disabled]="cloud.busy()">Reenviar correo</button>
          </div>
        }

        <section class="card stats" aria-label="Lo que se guarda">
          <h2>Tu historial</h2>
          <p>
            <strong>{{ history.entries().length }}</strong>
            {{ history.entries().length === 1 ? 'perfil guardado' : 'perfiles guardados' }} del modo Perfil.
          </p>
          <p class="muted">Solo tú puedes verlos. Funcionan sin conexión y se sincronizan cuando vuelve la red.</p>
          <div class="actions stretch">
            <a class="btn" routerLink="/perfil" [queryParams]="{ paso: 'historial' }">Ver mi historial</a>
          </div>
        </section>

        <section class="card stats" aria-label="Modo Investigador">
          <h2>Modo Investigador</h2>
          @if (cloud.isInvestigator()) {
            <p class="muted">Tu cuenta tiene acceso. Registra sesiones de medición con el protocolo y respáldalas en la nube.</p>
            <div class="actions stretch">
              <a class="btn" routerLink="/investigador">Sesiones de medición</a>
            </div>
          } @else if (cloud.request() === 'pendiente') {
            <p class="muted">Tu solicitud está en revisión. Cuando se apruebe, el modo aparecerá aquí.</p>
            <div class="actions stretch">
              <a class="btn secondary" routerLink="/cuenta/investigador">Ver mi solicitud</a>
            </div>
          } @else {
            <p class="muted">Este modo es para el equipo del estudio y se habilita a mano. Si formas parte, puedes pedir acceso.</p>
            <div class="actions stretch">
              <a class="btn secondary" routerLink="/cuenta/investigador">Solicitar ser investigador</a>
            </div>
          }
        </section>

        @if (cloud.message()) {
          <p class="notice info" role="status">{{ cloud.message() }}</p>
        }
        @if (cloud.error()) {
          <p class="notice error" role="alert">{{ cloud.error() }}</p>
        }

        <div class="actions stretch">
          <button type="button" class="btn secondary" (click)="cloud.signOut()" [disabled]="cloud.busy()">Cerrar sesión</button>
          <button type="button" class="btn danger" (click)="deleteAll()" [disabled]="cloud.busy() || history.entries().length === 0">Borrar mis perfiles de la nube</button>
        </div>
      }

      <app-install-card />
    </main>
  `,
  styles: `
    .who { display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-3); align-items: center; padding: var(--space-4); }
    .avatar { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; overflow: hidden; background: var(--glyph-bg); color: var(--glyph-fg); font-size: 1.5rem; font-weight: 700; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .id { display: grid; min-width: 0; }
    .id > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stats { display: grid; gap: var(--space-2); }
    .stats > * { margin: 0; }
    .stats h2 { font-size: 1.1rem; }
    .stats .actions { margin-top: var(--space-2); }
    .notice p { margin: 0 0 var(--space-2); }
  `,
})
export class CuentaPage {
  protected readonly cloud = inject(CloudService);
  protected readonly history = inject(ProfileHistoryService);
  protected readonly initial = computed(() => (this.cloud.user()?.name ?? this.cloud.user()?.email ?? '?').charAt(0).toUpperCase());

  constructor() {
    void this.cloud.start();
  }

  protected async deleteAll(): Promise<void> {
    if (globalThis.confirm('¿Borrar todos tus perfiles guardados en la nube? Esta acción no se puede deshacer.')) {
      await this.history.clear();
    }
  }
}
