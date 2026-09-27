import { motion } from "framer-motion";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

interface ProductivityGaugeProps {
  avgProgress: number;
  totalTasks: number;
  completedTasks: number;
}

export function ProductivityGauge({
  avgProgress,
  totalTasks,
  completedTasks,
}: ProductivityGaugeProps) {
  const gaugeColor =
    avgProgress >= 80
      ? "hsl(var(--emerald))"
      : avgProgress >= 50
        ? "hsl(var(--amber))"
        : "hsl(var(--destructive))";

  const data = [{ value: avgProgress, fill: gaugeColor }];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="glass-card rounded-xl p-5 flex flex-col h-full"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Team Productivity
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Overall avg. progress
          </p>
        </div>
        <div className="px-2 py-1 rounded-md bg-secondary text-xs font-medium text-muted-foreground">
          Live
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="relative w-full" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="55%"
              innerRadius="60%"
              outerRadius="90%"
              startAngle={180}
              endAngle={0}
              data={data}
            >
              <PolarAngleAxis
                type="number"
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />
              <RadialBar
                dataKey="value"
                cornerRadius={8}
                background={{ fill: "hsl(var(--secondary))" }}
              />
            </RadialBarChart>
          </ResponsiveContainer>

          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ top: "10%" }}
          >
            <span className="text-3xl font-bold" style={{ color: gaugeColor }}>
              {avgProgress}%
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              Average Progress
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border mt-2">
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">{completedTasks}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Completed
          </p>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">{totalTasks}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Total Tasks
          </p>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">
            {totalTasks > 0
              ? Math.round((completedTasks / totalTasks) * 100)
              : 0}
            %
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Completion
          </p>
        </div>
      </div>
    </motion.div>
  );
}
