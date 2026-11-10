import { predict } from './model-evaluator';
import { ModelSpec } from './model-bundle.types';
import parity from './testdata/parity.json';

interface ParityFile {
  features: string[];
  models: Record<string, ModelSpec>;
  cases: { inputs: Record<string, number>; expected: Record<string, number> }[];
}

const data = parity as unknown as ParityFile;

describe('Evaluadores de modelo: paridad con Python', () => {
  // Tolerancia: los árboles comparan en precisión simple; la suma de hojas se acumula en doble precisión.
  const TOL = 1e-3;

  for (const name of ['linear', 'random_forest', 'xgboost']) {
    it(`${name} coincide con scikit-learn/XGBoost en ${data.cases.length} casos fijos`, () => {
      let worst = 0;
      for (const c of data.cases) {
        const x = data.features.map((f) => c.inputs[f]);
        const got = predict(data.models[name], x);
        worst = Math.max(worst, Math.abs(got - c.expected[name]));
      }
      expect(worst).toBeLessThan(TOL);
    });
  }

  it('la regresión lineal es intercepto más producto punto', () => {
    expect(predict({ type: 'linear', intercept: 2, coef: [3, -1] }, [4, 5])).toBe(9);
  });

  it('un bosque promedia sus árboles y usa <= en cada división', () => {
    const tree = { left: [1, -1, -1], right: [2, -1, -1], feature: [0, -2, -2], threshold: [10, 0, 0], value: [0, 5, 9] };
    const spec: ModelSpec = { type: 'random_forest', trees: [tree, { ...tree, value: [0, 7, 11] }] };
    expect(predict(spec, [10])).toBe(6); // 10 <= 10 va a la izquierda: (5 + 7) / 2
    expect(predict(spec, [10.5])).toBe(10); // (9 + 11) / 2
  });

  it('XGBoost suma la base y las hojas, y usa < en cada división', () => {
    const tree = { feature: [0, -1, -1], threshold: [10, 0, 0], yes: [1, -1, -1], no: [2, -1, -1], missing: [1, -1, -1], leaf: [0, 1.5, -2] };
    const spec: ModelSpec = { type: 'xgboost', baseScore: 20, trees: [tree] };
    expect(predict(spec, [9.9])).toBe(21.5);
    expect(predict(spec, [10])).toBe(18); // 10 < 10 es falso: va a la rama "no"
    expect(predict(spec, [Number.NaN])).toBe(21.5); // valor ausente: rama "missing"
  });
});
