import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ReferenceValue, ValueStatus } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getValueStatus(value: number, ref: ReferenceValue | undefined): ValueStatus {
  if (!ref) return 'unknown';

  const refMin = ref.ref_min ?? -Infinity;
  const refMax = ref.ref_max ?? Infinity;

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

export function getStatusColor(status: ValueStatus): string {
  switch (status) {
    case 'normal': return 'text-green-600 dark:text-green-400';
    case 'warning': return 'text-amber-600 dark:text-amber-400';
    case 'high':
    case 'low': return 'text-red-600 dark:text-red-400';
    case 'critical_high':
    case 'critical_low': return 'text-red-800 dark:text-red-300';
    case 'unknown': return 'text-gray-500 dark:text-gray-400';
  }
}

export function getStatusBgColor(status: ValueStatus): string {
  switch (status) {
    case 'normal': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
    case 'warning': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300';
    case 'high':
    case 'low': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
    case 'critical_high':
    case 'critical_low': return 'bg-red-200 dark:bg-red-900/50 text-red-900 dark:text-red-200';
    case 'unknown': return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
  }
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

export function getStatusDot(status: ValueStatus): string {
  switch (status) {
    case 'normal': return 'bg-green-500';
    case 'warning': return 'bg-amber-500';
    case 'high':
    case 'low': return 'bg-red-500';
    case 'critical_high':
    case 'critical_low': return 'bg-red-700 animate-pulse';
    case 'unknown': return 'bg-gray-400';
  }
}

export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

export function formatNumber(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

export function getTrend(history: { value: number }[]): 'up' | 'down' | 'stable' | null {
  if (history.length < 2) return null;
  const last = history[history.length - 1].value;
  const prev = history[history.length - 2].value;
  const diff = ((last - prev) / Math.abs(prev)) * 100;
  if (Math.abs(diff) < 5) return 'stable';
  return diff > 0 ? 'up' : 'down';
}

export function groupByCategory<T extends { category: string }>(items: T[]): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});
}
