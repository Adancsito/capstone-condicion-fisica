// Falla si la compilación de producción contiene un paquete de modelo de demostración.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = join('dist', 'Capstone', 'browser', 'model-bundles');
let problems = [];
if (existsSync(dir)) {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    if (/^demo/i.test(f)) problems.push(`${f}: el nombre indica un paquete de demostración`);
    try {
      const b = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (b?.manifest?.isDemo) problems.push(`${f}: manifest.isDemo es true`);
    } catch {
      problems.push(`${f}: no se pudo leer como JSON`);
    }
  }
}
if (problems.length) {
  console.error('ERROR: la compilación de producción contiene paquetes de demostración:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('Producción sin paquetes de demostración.');
