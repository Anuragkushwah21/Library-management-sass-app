import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  color: string;
  /** Value ke neeche chhoti line. Default "Active". */
  hint?: string;
}

export function StatCard({ title, value, icon, color, hint }: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        {/* min-w-0 + leading-tight taaki "Available Seats" jaisa lamba title
            chhoti screen par icon ko dhakela na de */}
        <CardTitle className="min-w-0 text-xs font-medium leading-tight text-muted-foreground sm:text-sm">
          {title}
        </CardTitle>

        <div className={cn('shrink-0 rounded-lg p-1.5 text-white sm:p-2', color)}>
          {icon}
        </div>
      </CardHeader>

      <CardContent>
        <div className="text-xl font-bold tabular-nums sm:text-2xl">{value}</div>
        <p className="text-xs text-muted-foreground">{hint ?? 'Active'}</p>
      </CardContent>
    </Card>
  );
}
