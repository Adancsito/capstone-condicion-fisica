# Plan de la plataforma web y móvil del Capstone

**Fecha:** 13 de octubre de 2026
**Estado:** propuesta para aprobación. No se ha escrito código de la aplicación.
**Quién autoriza este trabajo:** instrucción directa del usuario del 13-oct-2026 ("la aplicación definitiva, desde cero, en Angular y luego Capacitor").
**Fuente metodológica:** `capstone-shared/docs/15-actualizacion-metodologica-claude-2026-10-06.md` (sincronizado el 13-oct). Prevalece sobre `docs/12` y `docs/06`. El inventario vigente está en `capstone-shared/INVENTARIO_FINAL_2026-10-13.md`.

## 0. Contexto confirmado por el usuario (13-oct, tarde)

- **T2 en una semana** (alrededor del 20 de octubre).
- **No hay datos reales** y **no se avanza con los modelos**. El trabajo actual es la recolección de datos y el desarrollo del frontend. La fase 4 (modelos reales) queda fuera de la T2.
- El usuario crea el proyecto Firebase.
- **Instrumentos aplicables a todos los participantes:** dinamómetro (probable), tensiómetro, reloj inteligente, tallímetro y balanza digital. No hay BIA, cajón de flexibilidad ni banco confirmados.
- **Capacidad cardiorrespiratoria:** hay un recorrido de 2 km medido; la caminadora solo se usará cuando el participante pueda ir al gimnasio. Las pruebas de caminadora (Ebbeling), de caminata de 2 km (UKK) y de carrera de 2 km **no son equivalentes**. Recomendación: una sola prueba para todos (UKK en el recorrido medido); decisión pendiente (sección 11).

## 1. Qué se construye

Una sola base de código Angular con tres modos:

| Modo | Para quién | Qué hace | Estado de los datos |
|---|---|---|---|
| **Perfil** | Usuario final | Ingresa edad, sexo y medidas corporales y recibe el perfil físico de los cinco componentes | 100 % local en el teléfono, sin envío a la nube |
| **Investigador** | Evaluador en el gimnasio | Consentimiento, tamizaje, antropometría repetida, pruebas físicas de referencia, control de calidad, exportación | Se sincroniza con Firebase, seudonimizado |
| **Demostración** | Desarrollo y revisión de diseño | El modo Perfil con un paquete de modelo ilustrativo | Siempre rotulado, nunca en la compilación de producción |

El modo Investigador es el camino crítico del proyecto: sin los 100 pares morfología–función no hay modelos reales. El modo Perfil es lo que el usuario pidió primero y lo que se muestra en la T2.

## 2. Reglas del proyecto que condicionan el diseño

| Regla vigente | Qué implica en la app |
|---|---|
| 100 participantes, 18 a 40 años, gimnasios de Lima | Texto de alcance y límites visible en "Acerca de". Validación de edad en el modo Investigador. |
| Cinco componentes separados, un modelo por componente | Cinco tarjetas independientes. No existe puntaje total. |
| Resultados continuos en unidades nativas | La tarjeta muestra el valor. Los niveles son secundarios. |
| Niveles Bajo/Promedio/Alto solo con puntos de corte válidos y exactitud balanceada mayor al 70 % | El nivel aparece únicamente si el paquete del modelo trae puntos de corte y la métrica registrada supera 0,70. Por defecto está apagado. |
| La incertidumbre salió del alcance | No se muestra rango ni intervalo. |
| Si un componente no se estima con desempeño suficiente, la app pide la prueba directa | Estado "Requiere prueba directa" por componente. |
| No usar categorías de dinamómetros comerciales | El registro guarda solo el valor numérico. |
| No inventar datos, normas ni resultados | El modo Demostración se rotula en cada pantalla y se excluye del build de producción (sección 5). |
| No programar pruebas, campos ni porcentajes de partición no cerrados | La batería, los predictores y las unidades son **configuración versionada**, no código (secciones 5 y 6). |
| Trazabilidad por participante y por componente | Cada registro guarda versión de protocolo, versión de la app, instrumento, evaluador, sede y fecha. |

## 3. Arquitectura

- **Angular 20.3**, componentes standalone, signals y formularios reactivos.
- **Sin SSR.** El proyecto generado trae SSR activado (`server.ts`, `main.server.ts`, `app.config.server.ts`, `app.routes.server.ts`, `@angular/ssr`, `express`, `outputMode: "server"`). Capacitor necesita una salida estática en `dist/Capstone/browser`. Se retira todo eso en la fase 0.
- **Interfaz propia** con tokens de diseño en SCSS (mismos colores de los diagramas V17), mobile-first de 360 a 412 px, modo oscuro y contraste AA. Alternativa: Ionic, que acelera componentes nativos pero choca con la identidad visual propia.
- **Capacitor** para Android primero. Plugins previstos: Preferences, Network, Filesystem y Share (exportación CSV), StatusBar, SplashScreen.
- **Pruebas:** Karma/Jasmine para unidades, Playwright para flujos de extremo a extremo.

```
src/app/
  core/          servicios: modelo, protocolo, almacenamiento, sincronización, autenticación
  shared/        componentes de interfaz y tokens de diseño
  features/
    perfil/          modo usuario final
    investigador/    modo recolección
    acerca/          alcance, metodología y limitaciones
  models/        tipos del paquete de modelo y del protocolo
public/model-bundles/   paquetes JSON de modelos (activos estáticos)
```

## 4. Firebase: qué sí y qué no

**Recomendación: Firebase en el plan gratuito (Spark), sin Cloud Functions** (Functions exige el plan de pago).

| Servicio | Uso | Motivo |
|---|---|---|
| Authentication (correo y contraseña) | Solo el modo Investigador | El usuario final no necesita cuenta |
| Firestore | Participantes, mediciones, pruebas, instrumentos, auditoría | Persistencia sin conexión incluida: el gimnasio puede no tener señal |
| Hosting | Versión web para la T2 y para la validación con expertos | Un enlace público sin servidor propio |
| Reglas de seguridad | Acceso por rol: solo investigadores autorizados | Son datos de salud |

Decisiones de privacidad:

1. El modo Perfil **no sube nada**. Los datos del usuario final se quedan en el dispositivo.
2. Identificador seudonimizado (`P001`, `P002`...). Los nombres reales no entran en Firestore; la tabla de equivalencias queda fuera de línea en poder del investigador.
3. Sin fotografías de rostro (la morfometría digital no está aprobada).
4. Pantalla de consentimiento versionada y almacenada con cada participante.
5. Región sudamericana para Firestore. Los datos de salud son datos sensibles bajo la Ley 29733 de Protección de Datos Personales del Perú; **confirmar el tratamiento con el asesor y el comité de ética** antes de recolectar.

Se usa el SDK modular de Firebase a través de un servicio propio. `@angular/fire` se evalúa solo si su versión para Angular 20 resulta estable al instalar.

## 5. Modelos dentro de la app

**Entrenamiento fuera de la app, evaluación dentro.** El pipeline de Python (Regresión lineal, Random Forest, XGBoost, un ganador por componente) produce un **paquete de modelo JSON versionado**. La app lo evalúa en el dispositivo, sin servidor.

Cada paquete incluye:

- `manifest`: versión, fecha, algoritmo ganador por componente, `isDemo`.
- `inputs`: lista de variables, unidad, rango válido y orden. **El formulario del modo Perfil se genera a partir de esta lista**; cuando el profesor cierre los predictores no hay que tocar código.
- `components[5]`: parámetros del modelo (coeficientes o árboles), unidad de salida, `meetsCriteria`, métricas de validación (MAE, RMSE, R², sesgo), rango observado en entrenamiento.
- `levels` (opcional): puntos de corte aprobados y exactitud balanceada. Si falta, no hay niveles.

Evaluadores en TypeScript: regresión lineal (producto punto), Random Forest (recorrido de árboles exportados de scikit-learn) y XGBoost (recorrido del JSON nativo). **Prueba de paridad obligatoria:** la salida en TypeScript debe coincidir con la de Python en un conjunto fijo de casos antes de aceptar cualquier paquete.

Reglas de salida por componente:

1. `meetsCriteria = false` → "Requiere prueba directa".
2. Alguna entrada fuera del rango visto en entrenamiento → "Requiere prueba directa". Esta regla viene de `docs/12` §12.11 y se confirma con el profesor.
3. En otro caso → valor continuo en la unidad nativa.

**Modo Demostración:** paquete con `isDemo: true`, banner fijo "DEMOSTRACIÓN: valores ilustrativos, no provienen del estudio". El build de producción falla si encuentra un paquete demo. Sirve para revisar diseño y flujo antes de tener datos.

Alternativa descartada por ahora: servir el modelo desde FastAPI. Agrega hosting y depende de la red. Se reconsidera solo si un algoritmo no puede exportarse.

## 6. Modelo de datos (Firestore)

| Colección | Contenido |
|---|---|
| `protocols/{version}` | Definición de la batería: pruebas, unidades, rangos, instrucciones. Permite cambiar una prueba sin cambiar código. |
| `participants/{pid}` | Edad, sexo de referencia, sede, consentimiento (versión y fecha), tamizaje, versión de protocolo, creado por |
| `participants/{pid}/measurements/{id}` | Tipo (peso, talla, cintura, cadera...), valor, unidad, número de repetición, instrumento, evaluador, fecha |
| `participants/{pid}/tests/{id}` | Componente, prueba, valor crudo, unidad, validez y motivo de invalidez, instrumento, evaluador |
| `instruments/{id}` | Marca, modelo, número de serie, verificaciones de repetibilidad antes y después de la recolección |
| `audit/{id}` | Quién cambió qué y cuándo |

Los paquetes de modelo **no** van en Firestore (límite de 1 MiB por documento); van como activos estáticos de la app y de Hosting.

### Protocolo inicial `v0` (batería de trabajo del Capstone V5)

El Capstone V5 ya nombra cinco resultados, que sirven de punto de partida del protocolo `v0`. Siguen siendo configuración y no código, porque `docs/15` indica que la fuerza de agarre depende de aprobar el dinamómetro y que la compra no está cerrada.

| Componente | Prueba en el Capstone V5 | Pendiente |
|---|---|---|
| Composición corporal | Porcentaje de grasa por bioimpedancia (referencia operativa estimada por el equipo, no medición directa) | Confirmar que habrá un equipo BIA único |
| Capacidad cardiorrespiratoria | Prueba en caminadora (Ebbeling et al., 1991) | Parámetros exactos del protocolo |
| Fuerza muscular | Fuerza máxima de prensión | Compra del dinamómetro (Camry EH101 recomendado) |
| Resistencia muscular | Resistencia de los extensores del tronco | Protocolo y cronometraje |
| Flexibilidad | Alcance anterior en la prueba de flexibilidad posterior | Dispositivo y variante |

Funciones del aplicativo según el Capstone V5: **ordenar el registro de campo** (modo Investigador) y **presentar solo las estimaciones respaldadas por la evaluación** (modo Perfil). El objetivo específico del Capstone dice "implementar el registro de la sesión y un perfil móvil que muestre solo las salidas respaldadas por la validación".

## 7. Pantallas

**Modo Perfil:** 1) bienvenida y aviso de uso (no es diagnóstico), 2) edad y sexo de referencia, 3) medidas con guía de cómo medir y validación de rangos, 4) perfil físico con cinco tarjetas, 5) detalle por componente (qué mide, con qué prueba se mide directamente, métricas del modelo), 6) historial local, 7) acerca de: población, n = 100, CRISP-DM y limitaciones.

**Modo Investigador:** 1) acceso, 2) lista de participantes y estado de sincronización, 3) consentimiento y tamizaje, 4) antropometría con repeticiones, 5) pruebas físicas paso a paso con cronómetro, 6) revisión y cierre de sesión, 7) exportación CSV/JSON, 8) instrumentos y verificación.

## 8. Fases

El plazo exacto de la T2 está por confirmar. Si sigue siendo alrededor del 20 de octubre, quedan unos 7 días; el calendario usa días relativos.

| Fase | Días | Entrega | Criterio de cierre |
|---|---|---|---|
| **0. Base** | D1 | Sin SSR, estructura de carpetas, tokens de diseño, `CLAUDE.md`, proyecto Firebase creado por el usuario | `ng build` genera `dist/Capstone/browser` sin errores |
| **1. Modo Perfil** | D2–D3 | Flujo completo con paquete demo rotulado y formulario generado desde el manifiesto | Prueba de flujo en Playwright y revisión visual en 3 anchos |
| **2. Modo Investigador** | D3–D5 | Protocolo configurable, formularios, persistencia sin conexión, sincronización, exportación | Un participante completo se registra sin red, se sincroniza y se exporta |
| **3. Android y web** | D5–D6 | APK de depuración en emulador o teléfono, versión web en Hosting | La app abre, funciona sin red y se instala |
| **4. Modelos reales** | Cuando existan los datos | Pipeline nuevo con diccionario de datos propio, exportador de paquetes, prueba de paridad, integración | Paridad Python–TypeScript y `meetsCriteria` calculado desde la validación |

Las fases 0 a 3 son alcanzables en el plazo. **La fase 4 depende de recolectar los 100 participantes** y queda fuera de la T2 (confirmado): para la T2 la app mostraría el modo Investigador real y el modo Perfil con el paquete demo rotulado.

**Estado de la fase 0 (13-oct):** hecha. Sin SSR (la compilación genera `dist/Capstone/browser`), estructura por funcionalidades con rutas perezosas (`inicio`, `perfil`, `investigador`, `acerca`), tokens de diseño con modo oscuro, 5 pruebas unitarias en verde y revisión visual en 375 px, claro y oscuro. Queda pendiente el proyecto Firebase (lo crea el usuario).

**Estado al 19-oct (actualización):**

- **Fase 1 (modo Perfil): hecha con paquete de demostración.** Formulario generado desde el manifiesto (obligatorias según los modelos), reglas de salida (valor continuo, «Requiere prueba directa» por no cumplir, por rango de entrenamiento o por medida faltante), niveles solo con exactitud balanceada > 70 %, historial local, banner de demostración. Evaluadores de regresión lineal, Random Forest y XGBoost con prueba de paridad contra Python (25 casos fijos, tolerancia 1e-3).
- **Fase 2 (modo Investigador): hecha en versión local.** Protocolo generado desde la base de datos, ficha paso a paso con compuerta de seguridad (consentimiento, elegibilidad, PAR-Q+, criterio de seguridad), avisos de repetibilidad, cronómetro, persistencia sin conexión en el dispositivo y exportación CSV/JSON. **Falta la sincronización con Firebase** (el proyecto no existe; la interfaz `SessionStoreService` ya la admite) y el inicio de sesión.
- **Fase 3 (Android y web): APK de depuración generado** (`android/app/build/outputs/apk/debug/app-debug.apk`, con el paquete de demostración). No se ejecutó en un emulador porque el equipo no tiene el controlador de aceleración del emulador; falta probarlo en un teléfono. La versión web en Hosting depende del proyecto de Firebase.
- **Fase 4:** el exportador de paquetes y la prueba de paridad existen; los modelos reales esperan los datos (mínimo provisional de 30 participantes utilizables).
- Producción: la compilación excluye el paquete de demostración y `npm run build:prod` falla si lo encuentra.

## 9. Verificación

- Pruebas de unidad de los evaluadores de modelo, la validación de rangos y las reglas de salida.
- Prueba de paridad Python–TypeScript sobre casos fijos.
- Playwright: flujo completo de cada modo, con y sin red.
- Pruebas de las reglas de seguridad de Firestore con el emulador.
- Comprobación en el build de producción de que no hay paquete demo.
- Cada bloque de trabajo deja una nota en `capstone-shared/reviews/` con la decisión que lo autoriza (regla 9 del `CLAUDE.md` compartido).

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| El profesor aún no aprueba batería, instrumentos ni predictores | Todo eso es configuración versionada, no código |
| Sin datos reales no hay modelos reales | Modo Demostración rotulado y excluido de producción; fase 4 separada |
| Plazo de la T2 muy corto | Entregas verticales por fase; modo Perfil primero, como se pidió |
| Datos de salud sensibles | Modo Perfil local, seudonimización, consentimiento versionado, reglas de acceso, revisión con el comité de ética |
| Capacitor 8 puede exigir una versión de JDK distinta de la instalada (Java 17 en PATH) | Verificar al ejecutar `cap add android`; Android Studio trae su propio JDK |
| `appId` provisional `com.capstone.fitnesslevel` | Definir el definitivo antes de cualquier publicación |

## 11. Decisiones

**Resueltas:** T2 en una semana; sin datos ni modelos en la T2; el usuario crea el proyecto Firebase (plan Spark).

**Pendientes del usuario:**

1. **Prueba cardiorrespiratoria única.** Recomendación: UKK de 2 km en el recorrido medido, para todos. Quien no pueda hacerla queda sin ese resultado (cada modelo usa las filas con resultado disponible). Admitir caminadora como alternativa exigiría registrarla como otro método y un subestudio de concordancia aprobado por el profesor. Correr los 2 km no se recomienda.
2. **Frecuencia cardiaca con el reloj.** La UKK depende de ella; `docs/12` pide comprobar el reloj contra una banda pectoral antes de confiar en él.
3. **Composición corporal, flexibilidad y extensores del tronco.** Sin BIA, cajón ni banco confirmados, esos tres resultados del Capstone V5 no tienen instrumento. ¿La balanza digital mide impedancia? El tensiómetro se registra como dato de tamizaje, no como resultado.
4. **Prioridad:** modo Investigador primero (la recolección está en curso) o modo Perfil primero.
5. **Interfaz:** diseño propio (adoptado por defecto en la fase 0) o Ionic.
6. **Nombre y `appId` definitivos** de la aplicación.
7. **Modo Demostración:** confirmar que es aceptable mostrarlo, siempre rotulado, en la presentación.
8. **Módulo de validación con expertos:** formulario dentro de la web o instrumento aparte.
9. **Batería del protocolo `v0`:** confirmar o corregir la del Capstone V5 (sección 6) según los puntos 1 a 3.
