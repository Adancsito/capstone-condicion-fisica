import { Injectable, computed, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { environment } from '../../../environments/environment';
import { SessionRecord } from '../protocol/protocol.types';
import { mergeSessions } from '../storage/session-merge';
import type { ProfileEntry } from '../storage/profile-history.service';

/** Versión del texto de consentimiento que acepta la persona al iniciar sesión. Si el texto cambia, se sube la versión. */
export const CONSENT_VERSION = 'v1-2026-11';

/** Cuántos perfiles guardados se leen del historial. */
const HISTORY_LIMIT = 100;

/** Mensaje en español para los errores más comunes de Firebase, con la acción que corresponde. */
export function cloudErrorMessage(error: unknown): string {
  const code = String((error as { code?: string })?.code ?? '');
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Se cerró la ventana de Google antes de terminar. Intenta de nuevo.';
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e intenta de nuevo.';
    case 'auth/unauthorized-domain':
      return 'Este sitio no está autorizado en Firebase. Agrega el dominio en Authentication, Configuración, Dominios autorizados.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'En Firebase falta activar este método de acceso (Authentication, Método de acceso).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
    case 'auth/missing-password':
      return 'Correo o contraseña incorrectos.';
    case 'auth/email-already-in-use':
      return 'Ese correo ya tiene una cuenta. Usa Ingresar en lugar de Registrarte.';
    case 'auth/weak-password':
      return 'La contraseña es muy corta. Usa al menos 8 caracteres.';
    case 'auth/requires-recent-login':
      return 'Por seguridad, vuelve a iniciar sesión e intenta de nuevo.';
    case 'auth/account-exists-with-different-credential':
      return 'Ya existe una cuenta con ese correo y otro método de acceso.';
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Para iniciar sesión necesitas internet; tus registros siguen guardados en este dispositivo.';
    case 'permission-denied':
      return 'Las reglas de Firestore no permiten esta operación. Revisa que hayas iniciado sesión y que las reglas estén publicadas.';
    case 'not-found':
    case 'failed-precondition':
      return 'En Firebase falta crear la base de datos Firestore.';
    case 'unavailable':
      return 'No se pudo conectar con la nube. Intenta de nuevo con conexión.';
    default:
      return code ? `No se pudo completar la operación (${code}).` : 'No se pudo completar la operación.';
  }
}

/** La cuenta de Google con la que se inició sesión. */
export interface CloudUser {
  uid: string;
  email: string | null;
  name: string | null;
  photo: string | null;
  emailVerified: boolean;
}

/** Estado del acceso como investigador: se sabe al leer, en Firestore, el documento que se crea a mano en `investigadores/{uid}`. */
export type InvestigatorState = 'desconocido' | 'si' | 'no';
/** Estado de la solicitud para ser investigador (documento `solicitudesInvestigador/{uid}`). */
export type RequestState = 'desconocido' | 'ninguna' | 'pendiente';

interface Firebase {
  auth: import('firebase/auth').Auth;
  db: import('firebase/firestore').Firestore;
  authMod: typeof import('firebase/auth');
  fsMod: typeof import('firebase/firestore');
}

/** Quita los `undefined`, que Firestore no acepta, y copia el objeto. */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Conexión con Firebase: inicio de sesión con Google y lo que se guarda por usuario en Firestore, bajo `usuarios/{uid}`:
 * los perfiles del historial del modo Perfil y las sesiones del modo Investigador. Sin iniciar sesión no se guarda nada en la
 * nube. El SDK se carga solo cuando se usa, para que quien no inicia sesión no pague ese peso. Sin conexión, Firestore guarda en el
 * dispositivo y envía al volver la red.
 */
@Injectable({ providedIn: 'root' })
export class CloudService {
  readonly configured = !!environment.firebase?.apiKey;
  readonly canSignIn = this.configured;
  /** En el APK de Capacitor la ventana de Google no funciona; allí se ingresa con correo y contraseña. */
  readonly canGoogle = this.configured && !Capacitor.isNativePlatform();
  readonly user = signal<CloudUser | null>(null);
  /** Falso hasta saber si hay una sesión guardada, para no mostrar «Inicia sesión» un instante a quien ya la tiene. */
  readonly ready = signal(false);
  readonly signedIn = computed(() => this.user() !== null);
  readonly investigator = signal<InvestigatorState>('desconocido');
  readonly request = signal<RequestState>('desconocido');
  /** Solo las cuentas que el equipo agregó a mano en Firebase pueden usar el modo Investigador. */
  readonly isInvestigator = computed(() => this.investigator() === 'si');
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  private fb?: Promise<Firebase>;
  private starting?: Promise<void>;
  private stopRoles: (() => void) | null = null;

  /** Arranca Firebase y empieza a escuchar el estado de la sesión. Es seguro llamarlo varias veces. */
  start(): Promise<void> {
    if (!this.canSignIn) {
      this.ready.set(true);
      return Promise.resolve();
    }
    this.starting ??= (async () => {
      try {
        const { auth, authMod } = await this.init();
        authMod.onAuthStateChanged(auth, (u) => {
          this.user.set(u ? { uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL, emailVerified: u.emailVerified } : null);
          this.ready.set(true);
          void this.watchRoles(u?.uid ?? null);
        });
        // si la ventana emergente estaba bloqueada se usó la redirección: al volver se recoge el resultado
        await authMod.getRedirectResult(auth).then((r) => r && this.recordConsent(r.user.uid), (e) => this.error.set(cloudErrorMessage(e)));
      } catch (e) {
        this.error.set(cloudErrorMessage(e));
        this.ready.set(true);
      }
    })();
    return this.starting;
  }

  /** Espera a que se sepa si hay sesión y, si la hay, si la cuenta es de investigador. Sirve para las rutas protegidas. */
  async settled(timeoutMs = 8000): Promise<void> {
    await this.start();
    const until = Date.now() + timeoutMs;
    const wait = (cond: () => boolean) =>
      new Promise<void>((resolve) => {
        const tick = () => (cond() || Date.now() > until ? resolve() : setTimeout(tick, 40));
        tick();
      });
    await wait(() => this.ready());
    if (this.user()) {
      await wait(() => this.investigator() !== 'desconocido');
    }
  }

  /** Inicia sesión con Google. */
  async signInWithGoogle(): Promise<boolean> {
    return this.run(async () => {
      const { auth, authMod } = await this.init();
      const provider = new authMod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        const cred = await authMod.signInWithPopup(auth, provider);
        await this.recordConsent(cred.user.uid);
      } catch (e) {
        if ((e as { code?: string }).code === 'auth/popup-blocked') {
          await authMod.signInWithRedirect(auth, provider); // la página se recarga y start() recoge el resultado
          return;
        }
        throw e;
      }
      this.message.set('Sesión iniciada.');
    });
  }

  /** Inicia sesión con correo y contraseña. */
  async signInWithEmail(email: string, password: string): Promise<boolean> {
    return this.run(async () => {
      const { auth, authMod } = await this.init();
      await authMod.signInWithEmailAndPassword(auth, email.trim(), password);
      this.message.set('Sesión iniciada.');
    });
  }

  /** Crea una cuenta con correo y contraseña, le pone su nombre y envía el correo de verificación. */
  async signUpWithEmail(name: string, email: string, password: string): Promise<boolean> {
    return this.run(async () => {
      const { auth, authMod } = await this.init();
      const cred = await authMod.createUserWithEmailAndPassword(auth, email.trim(), password);
      await authMod.updateProfile(cred.user, { displayName: name.trim() });
      this.user.update((u) => (u ? { ...u, name: name.trim() } : u));
      await this.recordConsent(cred.user.uid);
      await authMod.sendEmailVerification(cred.user).catch(() => undefined);
      this.message.set('Cuenta creada. Te enviamos un correo para verificar tu dirección.');
    });
  }

  /** Envía el correo para elegir una contraseña nueva. */
  async resetPassword(email: string): Promise<boolean> {
    return this.run(async () => {
      const { auth, authMod } = await this.init();
      await authMod.sendPasswordResetEmail(auth, email.trim()).catch((e: { code?: string }) => {
        // por privacidad no se revela si el correo existe
        if (e.code !== 'auth/user-not-found') {
          throw e;
        }
      });
      this.message.set('Si ese correo tiene una cuenta, te enviamos un enlace para cambiar la contraseña.');
    });
  }

  async resendVerification(): Promise<boolean> {
    return this.run(async () => {
      const { auth, authMod } = await this.init();
      if (auth.currentUser) {
        await authMod.sendEmailVerification(auth.currentUser);
        this.message.set('Te enviamos de nuevo el correo de verificación.');
      }
    });
  }

  async signOut(): Promise<void> {
    await this.run(async () => {
      const { auth, authMod } = await this.init();
      await authMod.signOut(auth);
      this.message.set('Sesión cerrada.');
    });
  }

  // ------------------------------------------------------------------------------------------ acceso de investigador

  /** Sigue en vivo los documentos que dicen si la cuenta es de investigador o si pidió serlo. */
  private async watchRoles(uid: string | null): Promise<void> {
    this.stopRoles?.();
    this.stopRoles = null;
    if (!uid) {
      this.investigator.set('desconocido');
      this.request.set('desconocido');
      return;
    }
    this.investigator.set('desconocido');
    this.request.set('desconocido');
    try {
      const { db, fsMod } = await this.init();
      const offInv = fsMod.onSnapshot(
        fsMod.doc(db, 'investigadores', uid),
        (d) => this.investigator.set(d.exists() && d.data()?.['activo'] === true ? 'si' : 'no'),
        () => this.investigator.set('no'),
      );
      const offReq = fsMod.onSnapshot(
        fsMod.doc(db, 'solicitudesInvestigador', uid),
        (d) => this.request.set(d.exists() ? 'pendiente' : 'ninguna'),
        () => this.request.set('ninguna'),
      );
      this.stopRoles = () => {
        offInv();
        offReq();
      };
    } catch {
      this.investigator.set('no');
      this.request.set('ninguna');
    }
  }

  /** Envía la solicitud para ser investigador. Se aprueba a mano, creando `investigadores/{uid}` en Firebase. */
  async requestInvestigator(data: { nombre: string; institucion: string; motivo: string }): Promise<boolean> {
    const user = this.user();
    if (!user) {
      return false;
    }
    return this.run(async () => {
      const { db, fsMod } = await this.init();
      await fsMod.setDoc(fsMod.doc(db, 'solicitudesInvestigador', user.uid), {
        uid: user.uid,
        correo: user.email ?? '',
        nombre: data.nombre.trim(),
        institucion: data.institucion.trim(),
        motivo: data.motivo.trim(),
        createdAt: new Date().toISOString(),
      });
      this.message.set('Solicitud enviada.');
    });
  }

  // ------------------------------------------------------------------------------------------ perfiles (modo Perfil)

  /** Escucha el historial de perfiles de la persona, del más nuevo al más viejo. Devuelve la función que deja de escuchar. */
  async watchPerfiles(uid: string, onData: (entries: ProfileEntry[]) => void, onError: (e: unknown) => void): Promise<() => void> {
    const { db, fsMod } = await this.init();
    const q = fsMod.query(fsMod.collection(db, 'usuarios', uid, 'perfiles'), fsMod.orderBy('createdAt', 'desc'), fsMod.limit(HISTORY_LIMIT));
    return fsMod.onSnapshot(
      q,
      (snap) => onData(snap.docs.map((d) => d.data() as ProfileEntry)),
      onError,
    );
  }

  /** Guarda un perfil. Con la persistencia local aparece de inmediato en el historial y se sube cuando hay red. */
  async savePerfil(uid: string, entry: ProfileEntry): Promise<void> {
    const { db, fsMod } = await this.init();
    await fsMod.setDoc(fsMod.doc(db, 'usuarios', uid, 'perfiles', entry.id), clean(entry));
  }

  async deletePerfil(uid: string, id: string): Promise<void> {
    const { db, fsMod } = await this.init();
    await fsMod.deleteDoc(fsMod.doc(db, 'usuarios', uid, 'perfiles', id));
  }

  /** Borra todos los perfiles guardados de la persona. Devuelve cuántos eran. */
  async deleteAllPerfiles(uid: string): Promise<number> {
    let count = 0;
    await this.run(async () => {
      const { db, fsMod } = await this.init();
      const snap = await fsMod.getDocs(fsMod.collection(db, 'usuarios', uid, 'perfiles'));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = fsMod.writeBatch(db);
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      count = snap.size;
      this.message.set(count === 1 ? 'Se borró 1 perfil de la nube.' : `Se borraron ${count} perfiles de la nube.`);
    });
    return count;
  }

  // ------------------------------------------------------------------------------------------ sesiones (modo Investigador)

  /** Sube lo que la nube no tiene, baja lo que el dispositivo no tiene y devuelve la lista unida. */
  async sync(local: readonly SessionRecord[], quiet = false): Promise<{ merged: SessionRecord[]; uploaded: number; downloaded: number } | null> {
    const uid = this.user()?.uid;
    if (!uid) {
      return null;
    }
    let result: { merged: SessionRecord[]; uploaded: number; downloaded: number } | null = null;
    await this.run(async () => {
      const { db, fsMod } = await this.init();
      const snap = await fsMod.getDocs(fsMod.collection(db, 'usuarios', uid, 'sesiones'));
      const remote = snap.docs.map((d) => d.data() as SessionRecord);
      const { merged, toUpload, toDownload } = mergeSessions(local, remote);
      for (let i = 0; i < toUpload.length; i += 400) {
        const batch = fsMod.writeBatch(db);
        for (const s of toUpload.slice(i, i + 400)) {
          batch.set(fsMod.doc(db, 'usuarios', uid, 'sesiones', s.id), clean({ id: s.id, status: s.status, values: s.values, createdAt: s.createdAt, updatedAt: s.updatedAt }));
        }
        await batch.commit();
      }
      result = { merged, uploaded: toUpload.length, downloaded: toDownload.length };
      this.message.set(quiet && toUpload.length + toDownload.length === 0 ? '' : `Sincronizado: ${toUpload.length} subidas y ${toDownload.length} recibidas.`);
    }, quiet);
    return result;
  }

  // ------------------------------------------------------------------------------------------ interno

  /** Deja constancia de la versión del consentimiento aceptada, en el documento de la persona. */
  private async recordConsent(uid: string): Promise<void> {
    const { db, fsMod } = await this.init();
    await fsMod.setDoc(fsMod.doc(db, 'usuarios', uid), { consentVersion: CONSENT_VERSION, consentAt: new Date().toISOString() }, { merge: true });
  }

  /** Ejecuta una operación mostrando «ocupado» y el error en español. Devuelve si salió bien. */
  private async run(job: () => Promise<void>, quiet = false): Promise<boolean> {
    this.busy.set(true);
    this.error.set('');
    if (!quiet) {
      this.message.set('');
    }
    try {
      await job();
      return true;
    } catch (e) {
      this.error.set(cloudErrorMessage(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private init(): Promise<Firebase> {
    this.fb ??= (async () => {
      const [appMod, authMod, fsMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
      const app = appMod.initializeApp(environment.firebase);
      const auth = authMod.getAuth(app);
      auth.languageCode = 'es';
      const db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) });
      return { auth, db, authMod, fsMod };
    })();
    return this.fb;
  }
}
