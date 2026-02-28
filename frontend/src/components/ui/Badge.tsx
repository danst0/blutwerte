import React from 'react';
import { cn } from '@/lib/utils';
import type { ValueStatus } from '@/types';
import { getStatusBgColor, getStatusLabel } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline';
}

export function Badge({ children, className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variant === 'default' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
        variant === 'outline' && 'border border-current',
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: ValueStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium', getStatusBgColor(status), className)}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        status === 'normal' ? 'bg-green-500' :
        status === 'warning' ? 'bg-amber-500' :
        (status === 'critical_high' || status === 'critical_low') ? 'bg-red-700' :
        status === 'unknown' ? 'bg-gray-400' : 'bg-red-500'
      )} />
      {getStatusLabel(status)}
    </span>
  );
}
