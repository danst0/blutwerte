import React from 'react';
import { cn, getValueStatus, getStatusLabel } from '@/lib/utils';
import type { Gender, ReferenceValue, ValueStatus } from '@/types';

interface TrafficLightProps {
  value: number;
  unit: string;
  ref?: ReferenceValue;
  gender?: Gender;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const dotColors: Record<ValueStatus, string> = {
  normal: 'bg-green-500 shadow-green-200 dark:shadow-green-900',
  warning: 'bg-amber-500 shadow-amber-200 dark:shadow-amber-900',
  high: 'bg-red-500 shadow-red-200 dark:shadow-red-900',
  low: 'bg-red-500 shadow-red-200 dark:shadow-red-900',
  critical_high: 'bg-red-700 shadow-red-300 dark:shadow-red-800 animate-pulse',
  critical_low: 'bg-red-700 shadow-red-300 dark:shadow-red-800 animate-pulse',
  unknown: 'bg-gray-400',
};

const dotSizes = {
  sm: 'w-2.5 h-2.5',
  md: 'w-3.5 h-3.5',
  lg: 'w-5 h-5',
};

export function TrafficLight({ value, unit, ref: refValue, gender, size = 'md', showLabel = false }: TrafficLightProps) {
  const status = getValueStatus(value, refValue, gender);

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'rounded-full shadow-md flex-shrink-0',
          dotColors[status],
          dotSizes[size]
        )}
        title={getStatusLabel(status)}
      />
      <span className="font-semibold tabular-nums">
        {value.toLocaleString('de-DE', { maximumFractionDigits: 2 })} {unit}
      </span>
      {showLabel && (
        <span className="text-sm text-gray-500 dark:text-gray-400">({getStatusLabel(status)})</span>
      )}
    </div>
  );
}

export function TrafficDot({ status, size = 'md' }: { status: ValueStatus; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn('rounded-full flex-shrink-0', dotColors[status], dotSizes[size])}
      title={getStatusLabel(status)}
    />
  );
}
