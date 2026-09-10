import type { Gender, ReferenceValue, ValueComparator, ValueStatus } from '../types';

export function getEffectiveRange(ref: ReferenceValue, gender?: Gender): { min: number; max: number } {
  let min = ref.ref_min ?? -Infinity;
  let max = ref.ref_max ?? Infinity;

  if (gender === 'female') {
    if (ref.ref_min_female !== undefined) min = ref.ref_min_female;
    if (ref.ref_max_female !== undefined) max = ref.ref_max_female;
  } else if (gender === 'male') {
    if (ref.ref_min_male !== undefined) min = ref.ref_min_male;
    if (ref.ref_max_male !== undefined) max = ref.ref_max_male;
  }

  return { min, max };
}

/**
 * Spiegelt getValueStatus aus frontend/src/lib/utils.ts, damit Web-Oberfläche,
 * KI-Kontext und PDF-Report denselben Wert identisch einordnen.
 */
export function getValueStatus(
  value: number,
  ref: ReferenceValue | undefined,
  gender?: Gender,
  comparator?: ValueComparator
): ValueStatus {
  if (!ref) return 'unknown';

  const { min: refMin, max: refMax } = getEffectiveRange(ref, gender);

  // Bestimmungsgrenzen wie "<5" sagen nur aus, dass der echte Wert darunter
  // liegt – bewertbar ist ein solcher Wert deshalb nur in eine Richtung.
  if (comparator === '<') {
    if (ref.critical_low !== undefined && value <= ref.critical_low) return 'critical_low';
    if (value <= refMin) return 'low';
    return value <= refMax ? 'normal' : 'unknown';
  }
  if (comparator === '>') {
    if (ref.critical_high !== undefined && value >= ref.critical_high) return 'critical_high';
    if (value >= refMax) return 'high';
    return value >= refMin ? 'normal' : 'unknown';
  }

  if (ref.critical_low !== undefined && value <= ref.critical_low) return 'critical_low';
  if (ref.critical_high !== undefined && value >= ref.critical_high) return 'critical_high';
  if (value < refMin) return 'low';
  if (value > refMax) return 'high';

  // Warning zone: within 10% of the limit
  const range = refMax - refMin;
  const buffer = range * 0.1;
  if (value < refMin + buffer || value > refMax - buffer) return 'warning';

  return 'normal';
}

export function getStatusLabel(status: ValueStatus): string {
  switch (status) {
    case 'normal': return 'Normal';
    case 'warning': return 'Grenzwertig';
    case 'high': return 'Erhöht';
    case 'low': return 'Erniedrigt';
    case 'critical_high': return 'Kritisch hoch';
    case 'critical_low': return 'Kritisch niedrig';
    case 'unknown': return 'Unbekannt';
  }
}

/** Sortiergewicht: je auffälliger der Wert, desto weiter vorne. */
export function getStatusSeverity(status: ValueStatus): number {
  switch (status) {
    case 'critical_high':
    case 'critical_low': return 0;
    case 'high':
    case 'low': return 1;
    case 'warning': return 2;
    case 'unknown': return 3;
    case 'normal': return 4;
  }
}

export function isAbnormal(status: ValueStatus): boolean {
  return getStatusSeverity(status) <= 1;
}

export function formatNumberDE(n: number): string {
  if (!Number.isFinite(n)) return '?';
  return n % 1 === 0 ? n.toString() : n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

export function formatValueDE(value: number, comparator?: ValueComparator): string {
  return comparator ? `${comparator}${formatNumberDE(value)}` : formatNumberDE(value);
}

export function formatDateDE(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return day && month && year ? `${day}.${month}.${year}` : dateStr;
}
