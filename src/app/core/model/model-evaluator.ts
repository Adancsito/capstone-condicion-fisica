import { ForestSpec, LinearSpec, ModelSpec, XgbSpec } from './model-bundle.types';

/**
 * Evaluadores de los tres tipos de modelo. Reproducen el cálculo de scikit-learn y XGBoost.
 * Los árboles comparan en precisión simple (float32), igual que ambas bibliotecas, por eso se aplica Math.fround a la entrada.
 */
export function predictLinear(spec: LinearSpec, x: readonly number[]): number {
  let y = spec.intercept;
  for (let i = 0; i < spec.coef.length; i++) {
    y += spec.coef[i] * x[i];
  }
  return y;
}

const LEAF = -1;

export function predictForest(spec: ForestSpec, x: readonly number[]): number {
  let sum = 0;
  for (const tree of spec.trees) {
    let node = 0;
    while (tree.left[node] !== LEAF) {
      const value = Math.fround(x[tree.feature[node]]);
      node = value <= tree.threshold[node] ? tree.left[node] : tree.right[node];
    }
    sum += tree.value[node];
  }
  return sum / spec.trees.length;
}

export function predictXgboost(spec: XgbSpec, x: readonly number[]): number {
  let sum = spec.baseScore;
  for (const tree of spec.trees) {
    let node = 0;
    while (tree.feature[node] >= 0) {
      const raw = x[tree.feature[node]];
      if (Number.isNaN(raw)) {
        node = tree.missing[node];
      } else {
        // XGBoost guarda el umbral en float32; el volcado JSON lo imprime con 9 cifras, así que se vuelve a redondear.
        node = Math.fround(raw) < Math.fround(tree.threshold[node]) ? tree.yes[node] : tree.no[node];
      }
    }
    sum += tree.leaf[node];
  }
  return sum;
}

export function predict(model: ModelSpec, x: readonly number[]): number {
  switch (model.type) {
    case 'linear':
      return predictLinear(model, x);
    case 'random_forest':
      return predictForest(model, x);
    case 'xgboost':
      return predictXgboost(model, x);
  }
}
