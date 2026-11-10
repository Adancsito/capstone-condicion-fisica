import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import { filter } from 'rxjs';

import { readJson, writeJson } from '../storage/key-value-store';

/** Evento no estándar que Chrome y Edge lanzan cuando la aplicación se puede instalar. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const HIDE_KEY = 'capstone.pwa.instalar.oculto';
const CHECK_EVERY_MS = 30 * 60 * 1000;

/** ¿La aplicación corre ya como app instalada (ventana propia, sin barra del navegador)? */
export function isStandalone(): boolean {
  const nav = globalThis.navigator as Navigator & { standalone?: boolean };
  return !!nav?.standalone || globalThis.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** iPhone o iPad (los iPad recientes se presentan como Mac con pantalla táctil). */
export function isIos(): boolean {
  const nav = globalThis.navigator;
  return /iPad|iPhone|iPod/.test(nav?.userAgent ?? '') || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1);
}

/**
 * Estado de la aplicación como PWA: conexión, instalación y actualizaciones. En el APK de Capacitor no hace nada (allí no hay
 * service worker ni instalación).
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly native = Capacitor.isNativePlatform();
  readonly online = signal(globalThis.navigator?.onLine ?? true);
  readonly updateReady = signal(false);
  readonly installed = signal(isStandalone());
  private readonly installEvent = signal<BeforeInstallPromptEvent | null>(null);
  private readonly hidden = signal(readJson<boolean>(HIDE_KEY, false));

  /** Chrome o Edge en Android o escritorio: se puede instalar con un botón. */
  readonly canPrompt = computed(() => !this.native && !this.installed() && this.installEvent() !== null);
  /** Safari en iPhone o iPad: no hay botón; se explica el paso Compartir → Añadir a pantalla de inicio. */
  readonly iosHint = computed(() => !this.native && !this.installed() && isIos());
  /** Mostrar la tarjeta de instalación: hay vía para instalar y la persona no la descartó. */
  readonly showInstall = computed(() => (this.canPrompt() || this.iosHint()) && !this.hidden());

  constructor() {
    const win = globalThis.window;
    if (!win || this.native) {
      return;
    }
    const on = (type: string, fn: (e: Event) => void) => {
      win.addEventListener(type, fn);
      this.destroyRef.onDestroy(() => win.removeEventListener(type, fn));
    };
    on('online', () => this.online.set(true));
    on('offline', () => this.online.set(false));
    on('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvent.set(e as unknown as BeforeInstallPromptEvent);
    });
    on('appinstalled', () => {
      this.installed.set(true);
      this.installEvent.set(null);
    });

    if (this.updates?.isEnabled) {
      const sub = this.updates.versionUpdates.pipe(filter((e) => e.type === 'VERSION_READY')).subscribe(() => this.updateReady.set(true));
      const bad = this.updates.unrecoverable.subscribe(() => this.updateReady.set(true));
      const timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
      on('focus', () => void this.check());
      this.destroyRef.onDestroy(() => {
        sub.unsubscribe();
        bad.unsubscribe();
        clearInterval(timer);
      });
    }
  }

  /** Muestra el cuadro de instalación del navegador. */
  async install(): Promise<void> {
    const ev = this.installEvent();
    if (!ev) {
      return;
    }
    await ev.prompt();
    const choice = await ev.userChoice;
    this.installEvent.set(null);
    if (choice.outcome === 'accepted') {
      this.installed.set(true);
    }
  }

  /** La persona no quiere ver más la invitación a instalar. */
  hideInstall(): void {
    this.hidden.set(true);
    writeJson(HIDE_KEY, true);
  }

  /** Activa la versión nueva y recarga. */
  async applyUpdate(): Promise<void> {
    try {
      await this.updates?.activateUpdate();
    } finally {
      globalThis.location.reload();
    }
  }

  private async check(): Promise<void> {
    if (!this.online()) {
      return;
    }
    try {
      await this.updates?.checkForUpdate();
    } catch {
      // sin red o service worker no disponible: se intenta en la próxima ocasión
    }
  }
}
