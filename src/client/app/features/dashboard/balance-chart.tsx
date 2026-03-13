import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ChartDataPoint } from "./use-dashboard";
import { formatMoneyMinor } from "@/lib/money";

export type BalanceChartProps = {
  data: ChartDataPoint[];
};

function formatDayLabel(dateStr: string): string {
  const [, , day] = dateStr.split("-");
  return String(Number(day));
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number | string }>;
  label?: string;
}) {
  if (!active || !payload?.[0] || !label) return null;
  const rawValue = Number(payload[0].value);
  const value = Number.isFinite(rawValue) ? Math.round(rawValue) : 0;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{formatMoneyMinor(value)}</p>
    </div>
  );
}

export function BalanceChart({ data }: BalanceChartProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Balance This Month
      </h2>
      <div className="rounded-lg border p-4">
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
          >
            <defs>
              <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-chart-1)"
                  stopOpacity={0.2}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-chart-1)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--color-border)"
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDayLabel}
              tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tickFormatter={(v: number) => formatMoneyMinor(Math.round(v))}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={90}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="totalBalance"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              fill="url(#balanceFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
