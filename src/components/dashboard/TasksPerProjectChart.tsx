import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface TasksPerProjectChartProps {
  data: { project_code: string; count: number }[];
}

const COLORS = [
  "hsl(152 76% 40%)",
  "hsl(172 76% 36%)",
  "hsl(132 76% 36%)",
  "hsl(192 76% 40%)",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-elevated">
        <p className="text-xs font-semibold text-foreground">
          {payload[0]?.payload?.project_code}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
            {payload[0]?.value}
          </span>{" "}
          tasks
        </p>
      </div>
    );
  }
  return null;
};

export function TasksPerProjectChart({ data }: TasksPerProjectChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: d.project_code.split("-").slice(0, 2).join("-"),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="glass-card rounded-xl p-5 flex flex-col h-full"
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">
          Tasks per Project
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Distribution by project code
        </p>
      </div>

      <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 4, left: -20, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{
                fill: "hsl(var(--muted-foreground))",
                fontSize: 10,
                fontFamily: "Inter",
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{
                fill: "hsl(var(--muted-foreground))",
                fontSize: 10,
                fontFamily: "Inter",
              }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "hsl(var(--border) / 0.5)" }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
