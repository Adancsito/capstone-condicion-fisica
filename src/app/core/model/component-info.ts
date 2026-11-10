import { ComponentKey } from './model-bundle.types';

/** Descripción fija de los cinco componentes, para mostrarlos incluso cuando no hay paquete de modelo. */
export const COMPONENT_INFO: readonly { key: ComponentKey; name: string; unit: string; directTest: string }[] = [
  { key: 'Y1', name: 'Composición corporal (% de grasa por bioimpedancia)', unit: '%', directTest: 'Bioimpedancia con un equipo fijo, antes de cualquier esfuerzo.' },
  { key: 'Y2', name: 'Capacidad cardiorrespiratoria', unit: 's', directTest: 'Caminata de 2 km en recorrido medido, con frecuencia cardiaca final.' },
  { key: 'Y3', name: 'Fuerza muscular (prensión manual máxima)', unit: 'kg', directTest: 'Prensión manual máxima con dinamómetro, tres intentos.' },
  { key: 'Y4', name: 'Resistencia muscular (extensores del tronco)', unit: 's', directTest: 'Sostén isométrico de los extensores del tronco (Biering-Sørensen), cronometrado.' },
  { key: 'Y5', name: 'Flexibilidad (alcance anterior)', unit: 'cm', directTest: 'Sit-and-reach con cajón, tres intentos.' },
];
