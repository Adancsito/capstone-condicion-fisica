# Condición física: aplicación web y móvil del Capstone

Angular 20 (sin SSR, componentes standalone y signals). Se publica como **PWA** (instalable en Android, iPhone y computador, con uso sin conexión). Es la vía principal. El APK de Android con Capacitor es una opción secundaria. Tres modos:

| Modo | Para quién | Qué hace |
|---|---|---|
| **Perfil** (`/perfil`) | Usuario final | Formulario generado desde el paquete de modelo; cinco tarjetas independientes con el valor continuo o «Requiere prueba directa». El cálculo ocurre en el teléfono y no exige cuenta. El historial solo se guarda si la persona inicia sesión con Google (Firestore, bajo su cuenta). |
| **Investigador** (`/investigador`) | Evaluador | Ficha de sesión paso a paso generada desde `public/protocols/protocol.json`, con compuerta de seguridad, avisos de repetibilidad, cronómetro y exportación a CSV con las columnas de la base de datos. Funciona sin conexión; con la sesión de Google se respalda en la nube, por usuario. |
| **Demostración** | Desarrollo y revisión | El modo Perfil con un paquete de modelo de datos inventados. Siempre rotulado «DEMOSTRACIÓN». Nunca llega a producción. |

## Comandos

```bash
npm start                 # servidor de desarrollo en http://localhost:4200
npm test                  # pruebas unitarias (Karma + Jasmine)
npm run build:prod        # compilación de producción; falla si hay un paquete de demostración
npm run android:sync:demo # (opción secundaria) compila con el paquete de demostración y sincroniza el proyecto Android
npm run android:sync:prod # compila para producción y sincroniza
```

APK de depuración, opción secundaria (necesita el JDK 21 que trae Android Studio y el SDK de Android):

```bash
cd android
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
gradlew.bat assembleDebug      # android/app/build/outputs/apk/debug/app-debug.apk
```

Crea `android/local.properties` con `sdk.dir=C:/Users/<usuario>/AppData/Local/Android/Sdk` si Gradle no encuentra el SDK.

## Cómo se conecta con el programa de análisis (`ml/`)

- **Modelos.** `python -m capstone_ml.export --dataset <base.xlsx> --out public/model-bundles/current.json` entrena con la base real y escribe el
  paquete. Con datos inventados, `--demo-sintetico --out public/model-bundles/demo.json`. La app evalúa el paquete en el dispositivo; no entrena.
- **Protocolo.** `python -m capstone_ml.export_protocol --out public/protocols/protocol.json` regenera el formulario de captura desde la base
  de datos. Si cambia una prueba, se cambia la base y se vuelve a generar; no se toca el código.
- **Paridad.** `python -m capstone_ml.export --paridad src/app/core/model/testdata/parity.json` genera los casos con que las pruebas
  comprueban que la app calcula lo mismo que scikit-learn y XGBoost.
- **Datos.** El CSV que exporta el modo Investigador se puede leer directamente con `python -m capstone_ml --dataset sesiones.csv`.

## Reglas del proyecto que el código respeta

Cinco componentes independientes y ningún puntaje total; valores en la unidad nativa; niveles solo con puntos de corte externos y exactitud
balanceada mayor al 70 %; sin incertidumbre; «Requiere prueba directa» si el componente no cumple o una entrada está fuera del rango de
entrenamiento; ninguna fotografía; datos de salud seudonimizados (códigos P001…); el modo Perfil no envía nada a la nube.

Estado y plan: `docs/PLAN-PLATAFORMA-WEB.md`.

## Firebase (modo Investigador)

La configuración web está en `src/environments/*.ts` (no es secreta; la protección está en las reglas). Para que la sincronización funcione, en la consola de Firebase del proyecto `casptone-d2321`:

1. **Authentication** → Método de acceso → activar *Correo electrónico/contraseña*; en Configuración de usuarios desactivar la creación de cuentas por los usuarios; en Usuarios, crear a mano el correo del evaluador.
2. **Firestore Database** → Crear base de datos (modo producción, región `southamerica-east1`) → pestaña Reglas → pegar `firestore.rules` → Publicar.

En la aplicación: Investigador → iniciar sesión → *Sincronizar* (sube lo que falta en la nube y baja lo que falta en el dispositivo; por código gana la versión más reciente). *Importar respaldo* carga un JSON con sesiones; `scripts/excel_a_respaldo.py` lo genera desde la base de datos en Excel.


## PWA (instalable en Android y iPhone)

La compilación de producción incluye `manifest.webmanifest`, iconos y un service worker (`ngsw-config.json`) que guarda la aplicación, los modelos y el protocolo para usarlos sin conexión. No se registra en desarrollo ni dentro del APK de Capacitor.

```bash
npm run build:prod
npx firebase deploy --only hosting,firestore:rules   # publica en Firebase Hosting y las reglas (requiere firebase login)
```

- Android (Chrome): aparece «Instalar» en la tarjeta de Inicio y en Cuenta. iPhone (Safari): Compartir → Añadir a pantalla de inicio.
- Para probarla en local: compila en producción y sirve `dist/Capstone/browser` con cualquier servidor estático con respaldo a `index.html` (el service worker solo funciona en `localhost` o HTTPS).

## Cuenta, historial y acceso de investigador

- **Ingresar y Registrarse** (`/ingresar`, `/registro`): correo y contraseña, o Google. En Firebase hay que activar los dos proveedores (Authentication, Método de acceso) y, si se publica en otro dominio, agregarlo en Dominios autorizados. En el APK de Capacitor solo funciona el correo (la ventana de Google no abre en el WebView).
- **Sin cuenta** se hace la prueba completa del modo Perfil; no hay historial. Al tocar Ingresar o Registrarse desde un resultado, se vuelve al mismo resultado.
- **Con cuenta**: historial de perfiles bajo `usuarios/{uid}/perfiles`, visible solo para esa persona; el consentimiento (versión y fecha) queda en `usuarios/{uid}`.
- **Modo Investigador**: solo se ve y se usa con una cuenta aprobada a mano. Sin cuenta el menú muestra Ingresar y Registrarse; con cuenta, Cuenta, y dentro de ella «Modo Investigador» (si no está aprobada, «Solicitar ser investigador»).

### Cómo aprobar a un investigador (a mano, en la consola de Firebase)

1. La persona se registra y envía la solicitud desde Cuenta. Queda en Firestore, colección `solicitudesInvestigador`, con su `uid`, correo, nombre, institución y motivo.
2. En Firestore crea el documento `investigadores/{uid}` (el mismo `uid` que aparece en Authentication, Usuarios) con el campo `activo` (booleano) en `true`. No hace falta más.
3. En su teléfono el modo aparece solo, sin cerrar sesión. Para quitar el acceso, cambia `activo` a `false` o borra el documento.

Las reglas (`firestore.rules`) comprueban ese documento en el servidor: aunque alguien vea la pantalla, no puede leer ni escribir sesiones si no está aprobado. Las sesiones se guardan en `usuarios/{uid}/sesiones`. La colección antigua `sesiones` compartida queda cerrada.
