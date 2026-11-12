import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export function StatsCard({ title, value, icon, description, variant = 'default' }: StatsCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={cn(
              'text-3xl font-bold mt-1',
              variant === 'success' && 'text-emerald-600 dark:text-emerald-400',
              variant === 'warning' && 'text-amber-600 dark:text-amber-400',
              variant === 'danger' && 'text-red-600 dark:text-red-400',
            )}>
              {value}
            </p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className={cn(
            'rounded-full p-3',
            variant === 'default' && 'bg-primary/10 text-primary',
            variant === 'success' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            variant === 'warning' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            variant === 'danger' && 'bg-red-500/10 text-red-600 dark:text-red-400',
          )}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
