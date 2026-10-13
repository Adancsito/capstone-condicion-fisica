# Capstone: plataforma web y móvil (Angular 20 + Capacitor)

Aplicativo del Capstone "Aplicativo móvil inteligente para identificar niveles de condición física mediante indicadores morfológicos y Machine Learning" (Jose Colona Silva, UPN). Esta carpeta es la aplicación definitiva, iniciada desde cero el 13-oct-2026. El prototipo anterior (`capstone-shared/code/frontend` y `backend`, basado en NHANES) es solo historial técnico.

## Leer antes de programar, en este orden

1. `C:\Users\Jose\Documents\Codex\2026-08-27\realtime-voice-chat-2\capstone-shared\CLAUDE.md`
2. `capstone-shared\docs\15-actualizacion-metodologica-claude-2026-10-06.md` (fuente de verdad más reciente; prevalece sobre `docs/12` y `docs/06`)
3. `docs/PLAN-PLATAFORMA-WEB.md` (plan de esta aplicación)

`capstone-shared` es la carpeta que también usa ChatGPT. Allí aparecen los documentos nuevos; revisar `INVENTARIO_FINAL_*.md` y `reviews/` cuando el usuario avise de cambios.

## Reglas técnicas

- Angular 20, componentes standalone, signals. **Sin SSR**: Capacitor necesita salida estática.
- Tres modos: Perfil (local, sin nube), Investigador (Firebase, seudonimizado) y Demostración (rotulado, nunca en producción).
- La batería, los predictores, las unidades y los puntos de corte son **configuración versionada**, no código. El formulario del modo Perfil se genera desde el manifiesto del paquete de modelo.
- Muestra vigente: 100 participantes, 18 a 40 años. No usar 250, 260 ni 20 a 40 años.
- Un modelo por componente (regresión lineal, Random Forest, XGBoost). Cinco tarjetas independientes, sin puntaje total.
- Salida: valor continuo en unidad nativa. Niveles solo con puntos de corte válidos y exactitud balanceada mayor al 70 %. Sin incertidumbre. Si un componente no cumple criterios, "Requiere prueba directa".
- No inventar datos, normas, precisión ni resultados. Todo valor ilustrativo lleva el rótulo "DEMOSTRACIÓN".
- Sin fotografías de rostro. Datos de salud: seudonimizados y con consentimiento versionado.
- Cada bloque de trabajo deja una nota en `capstone-shared/reviews/` indicando qué decisión lo autoriza.

## Convenciones

- Idioma de la interfaz y de los commits: español.
- No hacer commits ni pushes sin que el usuario lo pida.
- Verificar en el navegador cualquier cambio visual antes de darlo por terminado.
