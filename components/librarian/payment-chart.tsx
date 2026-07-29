'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface PaymentChartProps {
  data: Array<{
    name: string;
    value: number;
    fill: string;
  }>;
}

export function PaymentChart({ data }: PaymentChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Status</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {/* Height wrapper par — mobile par chart kam jagah leta hai */}
        <div className="h-[240px] w-full sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={(entry) => entry.name}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
