# Programa de análisis del Capstone

Lee la base de sesiones (`Base_de_datos_sesiones.xlsx`), controla su calidad y, cuando hay datos suficientes, entrena y evalúa un modelo
por componente. Con los datos de hoy (3 participantes) **solo produce el informe de calidad**: no entrena nada, porque con tan pocas
filas cualquier número sería un invento.

## Cómo usarlo

```bash
cd ml
pip install -r requirements.txt
python -m capstone_ml                      # usa la base de capstone-shared y escribe en ml/salida/
python -m capstone_ml --solo-calidad       # solo el informe de calidad
python -m capstone_ml --exclude P001       # excluir a un participante por decisión del investigador
python -m capstone_ml --holdout 0.3        # reservar el 30 % de participantes para una prueba final
python -m pytest                           # pruebas del programa (datos sintéticos)
```

## Qué hace

1. **Lee y recalcula.** Promedios de las dos lecturas, diferencias, IMC, mejores intentos y tiempo total de la caminata. No depende de
   que Excel haya guardado los resultados de las fórmulas.
2. **Calidad de datos** (`salida/calidad_datos.md`): campos obligatorios vacíos, diferencias entre lecturas mayores al umbral, valores
   fuera del rango de la base, códigos duplicados y observaciones escritas en las fichas. Nada se corrige ni se borra en silencio.
3. **Elegibilidad por componente**, con el motivo de cada exclusión: consentimiento, PAR-Q+ apto, criterio de seguridad, edad de 18 a 40
   años, y para cada prueba su regla propia (trotó en el UKK, edad fuera de 20 a 65 para el UKK, terminó por dolor en el tronco, equipo
   no realizado).
4. **Modelos** (solo si un componente tiene filas suficientes): regresión lineal (línea de base), Random Forest y XGBoost, con cuatro
   conjuntos de entradas (peso y talla; ampliado con las cinco circunferencias; ambos con y sin edad y sexo). Validación cruzada
   repetida **por participante**; si se indica `--holdout`, también una prueba final con participantes que nunca se usaron para ajustar.
5. **Decisión por componente.** Cumple si el MAE del ganador es menor que el de la línea de base y que el de predecir la media. Si no
   cumple, la salida de la aplicación es "Requiere prueba directa". No hay incertidumbre ni puntaje total.
6. **Figuras** (`salida/figuras/`): observado frente a estimado, residuos, curva de aprendizaje y curva de pérdida de XGBoost. No se
   usa curva ROC: los resultados son continuos.

## Lo que está pendiente de aprobación (todo en `capstone_ml/config.py`)

- Mínimo de filas para modelar (30), pliegues (5), repeticiones (5) y fracción de prueba final (ninguna por defecto). Son provisionales;
  el cálculo de tamaño de muestra y el esquema definitivo los fija el asesor.
- Umbrales de repetibilidad de las circunferencias distintas de la cintura (1,0 cm), extendidos por analogía.
- **Y2:** se modela el tiempo de la caminata de 2 km. El resultado definitivo es el VO₂máx de la ecuación de Oja et al. (1991), y sus
  coeficientes todavía no están verificados contra la publicación original; no se calculan hasta verificarlos.
- Hiperparámetros fijos y conservadores. El ajuste fino con validación anidada se hará con los datos reales.

## Datos sintéticos

`tests/synthetic.py` genera datos inventados para probar el código. No representan personas y no deben mezclarse con la base real ni
citarse como resultado. La carpeta `salida/` queda fuera del repositorio porque deriva de datos de salud seudonimizados.
