'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface StudentChartProps {
  data: Array<{
    month: string;
    students: number;
    paid: number;
  }>;
}

export function StudentChart({ data }: StudentChartProps) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Student Growth</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {/* Height wrapper par — mobile par chart kam jagah leta hai */}
        <div className="h-[240px] w-full sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            {/* Chhoti screen par labels aur ticks compact rakho */}
            <XAxis dataKey="month" tick={{ fontSize: 12 }} tickMargin={8} />
            <YAxis tick={{ fontSize: 12 }} width={44} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="students"
              stroke="#3b82f6"
              dot={{ fill: '#3b82f6' }}
              name="Total Students"
            />
            <Line
              type="monotone"
              dataKey="paid"
              stroke="#10b981"
              dot={{ fill: '#10b981' }}
              name="Paid Members"
            />
          </LineChart>
        </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
