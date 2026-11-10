# Guía: cómo probar los modelos y leer los resultados

Todo se ejecuta **desde la carpeta `ml/`** del repositorio (si no, aparece `No module named capstone_ml`). En PowerShell:

```powershell
cd C:\Users\Jose\OneDrive\Escritorio\AppCapstone\Capstone\ml
```

## 1. Comprobar que el programa funciona (pruebas automáticas)

```bash
python -m pytest -q
```

Tarda unos 4 minutos (entrena modelos de verdad); no lo interrumpas. Debe terminar con `18 passed`. Usan datos sintéticos solo para verificar que el código hace lo que dice (separación por participante, bloqueo con pocos datos, manejo de datos externos, etc.). No producen resultados del estudio.

## 2. Probar los modelos con los datos públicos (128 adultos, OSF efd2m)

```bash
python -m capstone_ml --dataset "C:\Users\Jose\Documents\Codex\2026-08-27\realtime-voice-chat-2\capstone-shared\data\externo\Base_externa_osf-efd2m.xlsx" --out salida\publica --holdout 0.3 --repeticiones-prueba 10
```

- `--holdout 0.3`: aparta 30 % de las personas como prueba final (el modelo nunca las ve al entrenarse). La proporción es una elección de demostración; la definitiva la fija el asesor.
- `--repeticiones-prueba 10`: repite esa prueba final con 10 particiones distintas para ver cuánto cambia el resultado. Con pocas personas, una sola partición engaña.
- Tarda unos minutos. Genera en `salida/publica/`: `resultados.md` (legible), `resultados.json`, `calidad_datos.md` y `figuras/`.

## 3. Cómo leer `resultados.md`

| Cifra | Qué significa | Cómo juzgarla |
|---|---|---|
| **MAE** | error promedio, en la unidad del componente (puntos de % de grasa, kg, cm) | cuanto menor, mejor |
| **R²** | proporción de la variación que el modelo explica (0 = nada, 1 = todo) | cerca de 0 = no mejora a predecir el promedio |
| **Línea de base** | regresión lineal solo con peso y talla | el modelo debe superarla |
| **Referencia (media)** | predecir siempre el promedio | el modelo debe superarla |
| **Sesgo** | error promedio con signo | cerca de 0 |
| **Por sexo** | desempeño dentro de hombres y dentro de mujeres | si cae mucho, el modelo solo distingue sexos |
| **Estabilidad** | % de particiones donde el modelo supera a la base y a la media | cerca de 100 % = resultado firme |

Criterio del proyecto: el componente solo da un valor si el MAE es menor que el de la línea de base **y** que el de la media. Si no, la aplicación muestra "Requiere prueba directa".

## 4. Cuando lleguen los datos propios

```bash
python -m capstone_ml --out salida/propios --holdout 0.3 --repeticiones-prueba 10
```

Usa por defecto `docs/T2/Base_de_datos_sesiones.xlsx`. Con menos de 30 participantes elegibles por componente no entrena (candado). Con las fichas propias más las públicas se pueden añadir `--externo <archivo>`, pero entonces ningún componente puede declararse apto ni publicarse: es solo una prueba del programa.

## 5. Exportar el paquete que lee la aplicación

```bash
python -m capstone_ml.export --demo-externo ...   # paquete de demostración entrenado con datos públicos
```

El paquete de demostración está rotulado "DEMOSTRACIÓN" y no entra en la compilación de producción.

## Advertencias

- Los datos públicos son de otra población (Europa Central) y otro protocolo; no validan el estudio ni van en el informe T2.
- Sin tronco (Y4) ni caminata de 2 km (Y2) en la fuente pública: esos dos componentes no se pueden probar con ella.
