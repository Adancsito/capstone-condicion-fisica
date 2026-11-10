import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CloudService } from '../../core/cloud/cloud.service';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Solo se vuelve a rutas internas, para que nadie pueda mandar a la persona a otro sitio con el enlace. */
function safeTarget(raw: string | undefined): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/cuenta';
}

type FieldErrors = Partial<Record<'nombre' | 'correo' | 'clave' | 'clave2' | 'acepto', string>>;

/** Ingresar y Registrarse: dos vistas del mismo formulario, con correo y contraseña o con Google. */
@Component({
  selector: 'app-auth-page',
  imports: [RouterLink],
  template: `
    <main class="page">
      <h1>{{ registro() ? 'Crear cuenta' : 'Ingresar' }}</h1>

      <nav class="seg" aria-label="Ingresar o registrarse">
        <a routerLink="/ingresar" [queryParams]="params()" [class.on]="!registro()" [attr.aria-current]="!registro() ? 'page' : null">Ingresar</a>
        <a routerLink="/registro" [queryParams]="params()" [class.on]="registro()" [attr.aria-current]="registro() ? 'page' : null">Registrarse</a>
      </nav>

      @if (!cloud.configured) {
        <p class="notice" role="note">Esta versión no está conectada a la nube, así que no se puede ingresar. La prueba del modo Perfil funciona igual.</p>
      } @else {
        <p class="lead">
          {{ registro() ? 'Con una cuenta guardas tu historial de perfiles y lo ves en cualquier dispositivo.' : 'Ingresa para ver tu historial y tu cuenta.' }}
          Hacer la prueba nunca exige cuenta.
        </p>

        <form class="card form" (submit)="submit($event)" novalidate>
          @if (registro()) {
            <div class="field">
              <label for="a-nombre">Nombre</label>
              <input id="a-nombre" class="input" type="text" autocomplete="name" [value]="nombre()" (input)="nombre.set($any($event.target).value)" />
              @if (errors().nombre; as e) { <small class="error" role="alert">{{ e }}</small> }
            </div>
          }
          <div class="field">
            <label for="a-correo">Correo</label>
            <input id="a-correo" class="input" type="email" inputmode="email" autocomplete="email" [value]="correo()" (input)="correo.set($any($event.target).value)" />
            @if (errors().correo; as e) { <small class="error" role="alert">{{ e }}</small> }
          </div>
          <div class="field">
            <label for="a-clave">Contraseña</label>
            <input id="a-clave" class="input" type="password" [attr.autocomplete]="registro() ? 'new-password' : 'current-password'" [value]="clave()" (input)="clave.set($any($event.target).value)" />
            @if (registro()) { <small>Al menos 8 caracteres.</small> }
            @if (errors().clave; as e) { <small class="error" role="alert">{{ e }}</small> }
          </div>
          @if (registro()) {
            <div class="field">
              <label for="a-clave2">Repite la contraseña</label>
              <input id="a-clave2" class="input" type="password" autocomplete="new-password" [value]="clave2()" (input)="clave2.set($any($event.target).value)" />
              @if (errors().clave2; as e) { <small class="error" role="alert">{{ e }}</small> }
            </div>
            <label class="consent">
              <input type="checkbox" [checked]="acepto()" (change)="acepto.set($any($event.target).checked)" />
              <span>
                Acepto que los datos que guarde (mis medidas y los resultados) se almacenen en la nube asociados a mi cuenta. Solo yo puedo verlos y
                puedo borrarlos cuando quiera desde Cuenta.
              </span>
            </label>
            @if (errors().acepto; as e) { <small class="error" role="alert">{{ e }}</small> }
          }

          @if (cloud.error()) {
            <p class="notice error" role="alert">{{ cloud.error() }}</p>
          }
          @if (cloud.message()) {
            <p class="notice info" role="status">{{ cloud.message() }}</p>
          }

          <button type="submit" class="btn" [disabled]="cloud.busy()">
            {{ cloud.busy() ? 'Un momento…' : registro() ? 'Crear cuenta' : 'Ingresar' }}
          </button>
          @if (!registro()) {
            <button type="button" class="link" (click)="forgot()" [disabled]="cloud.busy()">¿Olvidaste tu contraseña?</button>
          }

          @if (cloud.canGoogle) {
            <p class="or" aria-hidden="true"><span>o</span></p>
            <button type="button" class="btn google" [disabled]="cloud.busy() || (registro() && !acepto())" (click)="google()">
              <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              Continuar con Google
            </button>
            @if (!registro()) {
              <small class="muted">Si es tu primera vez con Google, al continuar aceptas que lo que guardes se almacene en la nube asociado a tu cuenta.</small>
            }
          }
        </form>
      }
    </main>
  `,
  styles: `
    .seg { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-1); padding: var(--space-1); border-radius: var(--radius-md); background: var(--color-surface-alt); }
    .seg a { display: grid; place-items: center; min-height: 44px; border-radius: calc(var(--radius-md) - 4px); color: var(--color-text); font-weight: 600; text-decoration: none; }
    .seg a.on { background: var(--color-primary); color: var(--color-primary-contrast); }
    .form { display: grid; gap: var(--space-4); }
    .form > * { margin: 0; }
    .form .field { margin: 0; }
    .consent { display: grid; grid-template-columns: auto 1fr; gap: var(--space-3); align-items: start; font-size: 0.9rem; color: var(--color-text-muted); cursor: pointer; }
    .consent input { width: 22px; height: 22px; margin: 1px 0 0; accent-color: var(--color-primary); }
    .link { justify-self: center; min-height: 40px; padding: 0 var(--space-3); border: 0; background: none; color: var(--color-text); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
    .or { display: grid; grid-template-columns: 1fr auto 1fr; gap: var(--space-3); align-items: center; color: var(--color-text-muted); font-size: 0.85rem; }
    .or::before, .or::after { content: ''; height: 1px; background: var(--color-border); }
    .google { background: #fff; color: #1f1f1f; box-shadow: inset 0 0 0 1.5px #dadce0; }
    .form > small { text-align: center; }
  `,
})
export class AuthPage {
  /** 'ingresar' o 'registro', según la ruta. */
  readonly modo = input<'ingresar' | 'registro'>('ingresar');
  /** Ruta interna a la que se vuelve al terminar. */
  readonly volver = input<string | undefined>(undefined);

  protected readonly cloud = inject(CloudService);
  private readonly router = inject(Router);

  protected readonly registro = computed(() => this.modo() === 'registro');
  protected readonly params = computed(() => (this.volver() ? { volver: this.volver() } : {}));
  protected readonly nombre = signal('');
  protected readonly correo = signal('');
  protected readonly clave = signal('');
  protected readonly clave2 = signal('');
  protected readonly acepto = signal(false);
  protected readonly errors = signal<FieldErrors>({});

  constructor() {
    void this.cloud.start();
    // En cuanto hay sesión (por correo o por Google) se vuelve a donde estaba la persona.
    effect(() => {
      if (this.cloud.user()) {
        void this.router.navigateByUrl(safeTarget(this.volver()));
      }
    });
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const e: FieldErrors = {};
    if (this.registro() && !this.nombre().trim()) {
      e.nombre = 'Escribe tu nombre.';
    }
    if (!EMAIL.test(this.correo().trim())) {
      e.correo = 'Escribe un correo válido.';
    }
    if (this.registro()) {
      if (this.clave().length < 8) {
        e.clave = 'Usa al menos 8 caracteres.';
      }
      if (this.clave2() !== this.clave()) {
        e.clave2 = 'Las contraseñas no coinciden.';
      }
      if (!this.acepto()) {
        e.acepto = 'Para crear la cuenta debes aceptar el guardado de tus datos.';
      }
    } else if (!this.clave()) {
      e.clave = 'Escribe tu contraseña.';
    }
    this.errors.set(e);
    if (Object.keys(e).length > 0) {
      return;
    }
    if (this.registro()) {
      await this.cloud.signUpWithEmail(this.nombre(), this.correo(), this.clave());
    } else {
      await this.cloud.signInWithEmail(this.correo(), this.clave());
    }
  }

  protected async forgot(): Promise<void> {
    if (!EMAIL.test(this.correo().trim())) {
      this.errors.set({ correo: 'Escribe tu correo arriba y vuelve a tocar esta opción.' });
      return;
    }
    this.errors.set({});
    await this.cloud.resetPassword(this.correo());
  }

  protected google(): Promise<boolean> {
    return this.cloud.signInWithGoogle();
  }
}
