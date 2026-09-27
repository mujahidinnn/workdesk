import { useMemo } from "react";
import { format, subDays } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface ActivityBucket {
  hour: string;
  action: string;
  n: number;
}

const DAYS = 14;

// Delete is also dashed so it isn't distinguished from Create by hue alone.
const SERIES = [
  { key: "create", name: "Create", color: "#10b981" },
  { key: "update", name: "Update", color: "#0ea5e9" },
  { key: "delete", name: "Delete", color: "#f43f5e", dash: "4 3" },
] as const;

type Row = { day: string; label: string; create: number; update: number; delete: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ActivityTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: { value: number }) => s + p.value, 0);
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2.5 shadow-elevated text-xs space-y-1">
      <p className="font-semibold text-foreground mb-1">
        {label} · {total} events
      </p>
      {[...payload].reverse().map((p: { name: string; value: number; color: string }) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export function ActivityChart({ buckets }: { buckets: ActivityBucket[] }) {
  const data = useMemo(() => {
    const rows = new Map<string, Row>();
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const day = format(d, "yyyy-MM-dd");
      rows.set(day, { day, label: format(d, "dd MMM"), create: 0, update: 0, delete: 0 });
    }
    for (const b of buckets) {
      const row = rows.get(format(new Date(b.hour), "yyyy-MM-dd"));
      const key = b.action === "insert" ? "create" : b.action;
      if (row && (key === "create" || key === "update" || key === "delete")) row[key] += b.n;
    }
    return [...rows.values()];
  }, [buckets]);

  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<ActivityTooltip />} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => (
              <span style={{ color: "hsl(var(--muted-foreground))" }}>{value}</span>
            )}
          />
          {SERIES.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stackId="a"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={"dash" in s ? s.dash : undefined}
              fill={s.color}
              fillOpacity={0.2}
              activeDot={{ r: 4, stroke: "hsl(var(--background))", strokeWidth: 2 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
