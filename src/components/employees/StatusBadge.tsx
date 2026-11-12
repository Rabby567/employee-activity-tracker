import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'online' | 'idle' | 'offline';
  animated?: boolean;
}

export function StatusBadge({ status, animated = true }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize',
        status === 'online' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        status === 'idle' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        status === 'offline' && 'bg-muted text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          status === 'online' && 'bg-emerald-500',
          status === 'idle' && 'bg-amber-500',
          status === 'offline' && 'bg-muted-foreground',
          animated && status !== 'offline' && 'animate-pulse'
        )}
      />
      {status}
    </span>
  );
}
