import type {
  BloodEntry,
  Gender,
  Lifestyle,
  ReferenceValue,
  UserData,
  ValueComparator,
  ValueStatus,
} from '../types';
import { findReferenceValue } from './fileStore';
import { getEffectiveRange, getStatusSeverity, getValueStatus, isAbnormal } from './status';

export interface ReportPoint {
  date: string;
  value: number;
  comparator?: ValueComparator;
}

export interface ReportValue {
  name: string;
  long_name?: string;
  category: string;
  unit: string;
  ref?: ReferenceValue;
  range: { min: number; max: number };
  status: ValueStatus;
  latest: ReportPoint;
  previous?: ReportPoint;
  /** Relative Veränderung zur Vormessung in Prozent. */
  changePct?: number;
  trend: 'up' | 'down' | 'stable' | null;
  history: ReportPoint[];
}

export interface ReportCounts {
  total: number;
  normal: number;
  warning: number;
  abnormal: number;
  unknown: number;
}

export interface ReportModel {
  displayName: string;
  gender?: Gender;
  diagnoses: string[];
  medications: string[];
  lifestyle?: Lifestyle;
  generatedAt: Date;
  /** Zeitraum der berücksichtigten Einträge, leer wenn keine vorhanden. */
  periodFrom?: string;
  periodTo?: string;
  entries: BloodEntry[];
  values: ReportValue[];
  counts: ReportCounts;
  scope: ReportScope;
  months: number;
  /** Werte, die durch den Filter "nur auffällige" ausgeblendet wurden. */
  hiddenCount: number;
}

export type ReportScope = 'all' | 'abnormal';

export interface ReportOptions {
  /** 0 = gesamter Verlauf */
  months: number;
  scope: ReportScope;
  includeAi: boolean;
}

/** Veränderung < 3 % gilt als stabil – dieselbe Schwelle wie im Dashboard. */
const STABLE_THRESHOLD_PCT = 3;

function cutoffDate(months: number): string | null {
  if (months <= 0) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function buildReportModel(userData: UserData, options: ReportOptions): ReportModel {
  const cutoff = cutoffDate(options.months);
  const entries = userData.entries
    .filter((e) => !cutoff || e.date >= cutoff)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const byName = new Map<string, ReportPoint[]>();
  const meta = new Map<string, { category: string; unit: string; long_name?: string }>();

  for (const entry of entries) {
    for (const val of entry.values) {
      const points = byName.get(val.name) ?? [];
      points.push({ date: entry.date, value: val.value, comparator: val.comparator });
      byName.set(val.name, points);
      // Einträge sind aufsteigend sortiert – am Ende gewinnt die jüngste Messung
      meta.set(val.name, { category: val.category, unit: val.unit, long_name: val.long_name });
    }
  }

  const values: ReportValue[] = [];
  for (const [name, history] of byName) {
    const info = meta.get(name)!;
    const ref = findReferenceValue(name);
    const latest = history[history.length - 1];
    const previous = history.length >= 2 ? history[history.length - 2] : undefined;

    let changePct: number | undefined;
    let trend: ReportValue['trend'] = null;
    if (previous && previous.value !== 0) {
      changePct = ((latest.value - previous.value) / Math.abs(previous.value)) * 100;
      trend = Math.abs(changePct) < STABLE_THRESHOLD_PCT ? 'stable' : changePct > 0 ? 'up' : 'down';
    }

    values.push({
      name,
      long_name: info.long_name,
      category: info.category,
      unit: info.unit,
      ref,
      range: ref ? getEffectiveRange(ref, userData.gender) : { min: -Infinity, max: Infinity },
      status: getValueStatus(latest.value, ref, userData.gender, latest.comparator),
      latest,
      previous,
      changePct,
      trend,
      history,
    });
  }

  const counts = values.reduce<ReportCounts>(
    (acc, v) => {
      acc.total++;
      if (v.status === 'normal') acc.normal++;
      else if (v.status === 'warning') acc.warning++;
      else if (v.status === 'unknown') acc.unknown++;
      else acc.abnormal++;
      return acc;
    },
    { total: 0, normal: 0, warning: 0, abnormal: 0, unknown: 0 }
  );

  values.sort((a, b) => {
    const bySeverity = getStatusSeverity(a.status) - getStatusSeverity(b.status);
    if (bySeverity !== 0) return bySeverity;
    const byCategory = a.category.localeCompare(b.category, 'de');
    return byCategory !== 0 ? byCategory : a.name.localeCompare(b.name, 'de');
  });

  const visible = options.scope === 'abnormal' ? values.filter((v) => isAbnormal(v.status)) : values;

  return {
    displayName: userData.display_name || 'Unbekannt',
    gender: userData.gender,
    diagnoses: userData.diagnoses ?? [],
    medications: userData.medications ?? [],
    lifestyle: userData.lifestyle,
    generatedAt: new Date(),
    periodFrom: entries[0]?.date,
    periodTo: entries[entries.length - 1]?.date,
    entries,
    values: visible,
    counts,
    scope: options.scope,
    months: options.months,
    hiddenCount: values.length - visible.length,
  };
}

/** Gruppiert unter Beibehaltung der Reihenfolge (auffälligste Kategorie zuerst). */
export function groupByCategory(values: ReportValue[]): Array<[string, ReportValue[]]> {
  const groups = new Map<string, ReportValue[]>();
  for (const v of values) {
    const list = groups.get(v.category) ?? [];
    list.push(v);
    groups.set(v.category, list);
  }
  return Array.from(groups);
}

// ─── Lifestyle-Beschriftungen ─────────────────────────────────────────────────

const LIFESTYLE_LABELS: Record<string, Record<string, string>> = {
  smoking: { never: 'Nichtraucher', former: 'Ex-Raucher', occasional: 'Gelegenheitsraucher', regular: 'Raucher' },
  alcohol: { never: 'Kein Alkohol', rarely: 'Selten', moderate: 'Moderat', regular: 'Regelmäßig' },
  exercise: { none: 'Kein Sport', light: 'Leichte Aktivität', moderate: 'Moderate Aktivität', active: 'Aktiv', very_active: 'Sehr aktiv' },
  diet: { mixed: 'Mischkost', vegetarian: 'Vegetarisch', vegan: 'Vegan', pescatarian: 'Pescatarisch', keto: 'Keto', other: 'Andere' },
  stress_level: { low: 'Niedrig', moderate: 'Moderat', high: 'Hoch', very_high: 'Sehr hoch' },
};

export function describeLifestyle(ls?: Lifestyle): Array<{ label: string; value: string }> {
  if (!ls) return [];
  const parts: Array<{ label: string; value: string }> = [];
  if (ls.smoking) parts.push({ label: 'Rauchen', value: LIFESTYLE_LABELS.smoking[ls.smoking] });
  if (ls.alcohol) parts.push({ label: 'Alkohol', value: LIFESTYLE_LABELS.alcohol[ls.alcohol] });
  if (ls.exercise) parts.push({ label: 'Bewegung', value: LIFESTYLE_LABELS.exercise[ls.exercise] });
  if (ls.diet) parts.push({ label: 'Ernährung', value: LIFESTYLE_LABELS.diet[ls.diet] });
  if (ls.sleep_hours) parts.push({ label: 'Schlaf', value: `${ls.sleep_hours} Std/Nacht` });
  if (ls.stress_level) parts.push({ label: 'Stress', value: LIFESTYLE_LABELS.stress_level[ls.stress_level] });
  return parts;
}
