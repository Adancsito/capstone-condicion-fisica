/** Protocolo de captura: configuración (public/protocols/protocol.json), no código. */

export type FieldType = 'text' | 'textarea' | 'date' | 'time' | 'integer' | 'number' | 'select';

export interface Condition {
  key: string;
  equals: string;
}

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  min?: number;
  max?: number;
  options?: FieldOption[];
  help?: string;
  pattern?: string;
  required: boolean | { if: Condition };
  visibleIf?: Condition;
}

export interface SectionSpec {
  id: string;
  title: string;
  fields: FieldSpec[];
}

export interface GateRule extends Condition {
  message: string;
}

export interface Protocol {
  protocolId: string;
  title: string;
  sections: SectionSpec[];
  gate: { appliesFromSection: string; requires: GateRule[] };
  thresholds: Record<string, number>;
  exportColumns: string[];
}

export type FieldValue = string | number | null;
export type SessionValues = Record<string, FieldValue>;

export type SessionStatus = 'borrador' | 'completa' | 'no_continua';

export interface SessionRecord {
  id: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  values: SessionValues;
}
