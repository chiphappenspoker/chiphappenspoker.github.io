'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface PnLChartDataPoint {
  date: string;
  cumulativeProfit: number;
}

interface PnLChartProps {
  data: PnLChartDataPoint[];
}

function formatDate(label: string): string {
  try {
    const d = new Date(label);
    return isNaN(d.getTime()) ? label : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return label;
  }
}

export function PnLChart({ data }: PnLChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-outline)] bg-[var(--color-panel)] p-6 min-h-[200px] flex items-center justify-center">
        <p className="muted-text">No data for this period.</p>
      </div>
    );
  }

  const accent = 'var(--color-accent)';
  const muted = 'var(--color-muted)';
  const outline = 'var(--color-outline)';

  return (
    <div className="rounded-lg border border-[var(--color-outline)] bg-[var(--color-panel)] p-4 min-h-[240px]">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={outline} opacity={0.6} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke={muted}
            tick={{ fill: muted, fontSize: 11 }}
            axisLine={{ stroke: outline }}
          />
          <YAxis
            dataKey="cumulativeProfit"
            stroke={muted}
            tick={{ fill: muted, fontSize: 11 }}
            axisLine={{ stroke: outline }}
            tickFormatter={(v) => (v >= 0 ? `+${v}` : `${v}`)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-panel)',
              border: `1px solid ${outline}`,
              borderRadius: '6px',
              color: 'var(--color-text)',
            }}
            labelStyle={{ color: muted }}
            formatter={(value) => [
              typeof value === 'number' ? (value >= 0 ? `+${value}` : `${value}`) : String(value),
              'Cumulative profit',
            ]}
            labelFormatter={(label) => formatDate(typeof label === 'string' ? label : String(label ?? ''))}
          />
          <Line
            type="monotone"
            dataKey="cumulativeProfit"
            stroke={accent}
            strokeWidth={2}
            dot={{ fill: accent, r: 3 }}
            activeDot={{ r: 5, stroke: accent, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
