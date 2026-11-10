import { derived } from './session-logic';
import { Protocol, SessionRecord, SessionValues } from './protocol.types';

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = typeof value === 'number' ? String(value) : value;
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV con las mismas columnas y el mismo orden que la hoja Registro de la base de datos, listo para pegar en Excel o para el programa
 * de análisis. Incluye las columnas calculadas.
 */
export function sessionsToCsv(protocol: Protocol, sessions: readonly SessionRecord[]): string {
  const rows = [protocol.exportColumns.join(',')];
  for (const s of sessions) {
    const calc = derived(s.values);
    const row = protocol.exportColumns.map((col) => {
      const v: string | number | null = col in calc ? calc[col] : (s.values[col] ?? null);
      return cell(typeof v === 'number' && col in calc ? Math.round(v * 1e6) / 1e6 : v);
    });
    rows.push(row.join(','));
  }
  return rows.join('\n') + '\n';
}

/** Un participante por registro con sus valores originales, para respaldo. */
export function sessionsToJson(sessions: readonly SessionRecord[]): string {
  return JSON.stringify(
    sessions.map((s: SessionRecord): { id: string; status: string; values: SessionValues } => ({ id: s.id, status: s.status, values: s.values })),
    null,
    1,
  );
}
