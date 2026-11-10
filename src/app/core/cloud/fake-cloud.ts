import { computed, signal } from '@angular/core';

import { ProfileEntry } from '../storage/profile-history.service';
import { CloudUser, InvestigatorState, RequestState } from './cloud.service';

/** Sustituto de CloudService para las pruebas: sin Firebase, con el historial y los permisos en memoria. */
export class FakeCloud {
  readonly configured = true;
  readonly canSignIn = true;
  readonly canGoogle = true;
  readonly ready = signal(true);
  readonly user = signal<CloudUser | null>(null);
  readonly investigator = signal<InvestigatorState>('desconocido');
  readonly request = signal<RequestState>('desconocido');
  readonly isInvestigator = computed(() => this.investigator() === 'si');
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  saved: ProfileEntry[] = [];
  requests: { nombre: string; institucion: string; motivo: string }[] = [];
  private push: ((list: ProfileEntry[]) => void) | null = null;

  start(): Promise<void> {
    return Promise.resolve();
  }

  settled(): Promise<void> {
    return Promise.resolve();
  }

  /** Inicia sesión como una persona común; `asInvestigator` simula que el equipo la aprobó a mano. */
  login(asInvestigator = false): void {
    this.user.set({ uid: 'u1', email: 'prueba@example.com', name: 'Persona de prueba', photo: null, emailVerified: true });
    this.investigator.set(asInvestigator ? 'si' : 'no');
    this.request.set('ninguna');
  }

  signInWithGoogle(): Promise<boolean> {
    this.login();
    return Promise.resolve(true);
  }

  signInWithEmail(): Promise<boolean> {
    this.login();
    return Promise.resolve(true);
  }

  signUpWithEmail(name: string): Promise<boolean> {
    this.login();
    this.user.update((u) => (u ? { ...u, name } : u));
    return Promise.resolve(true);
  }

  resetPassword(): Promise<boolean> {
    this.message.set('Si ese correo tiene una cuenta, te enviamos un enlace para cambiar la contraseña.');
    return Promise.resolve(true);
  }

  resendVerification(): Promise<boolean> {
    return Promise.resolve(true);
  }

  requestInvestigator(data: { nombre: string; institucion: string; motivo: string }): Promise<boolean> {
    this.requests.push(data);
    this.request.set('pendiente');
    return Promise.resolve(true);
  }

  signOut(): Promise<void> {
    this.user.set(null);
    this.investigator.set('desconocido');
    this.request.set('desconocido');
    return Promise.resolve();
  }

  watchPerfiles(_uid: string, onData: (list: ProfileEntry[]) => void): Promise<() => void> {
    this.push = onData;
    onData(this.saved);
    return Promise.resolve(() => (this.push = null));
  }

  savePerfil(_uid: string, entry: ProfileEntry): Promise<void> {
    this.saved = [entry, ...this.saved];
    this.push?.(this.saved);
    return Promise.resolve();
  }

  deletePerfil(_uid: string, id: string): Promise<void> {
    this.saved = this.saved.filter((e) => e.id !== id);
    this.push?.(this.saved);
    return Promise.resolve();
  }

  deleteAllPerfiles(): Promise<number> {
    const n = this.saved.length;
    this.saved = [];
    this.push?.(this.saved);
    return Promise.resolve(n);
  }

  sync(): Promise<null> {
    return Promise.resolve(null);
  }
}
