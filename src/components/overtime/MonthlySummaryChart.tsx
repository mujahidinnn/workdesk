import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { parseISO } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Clock, MapPin, Plane, Timer } from "lucide-react";
import { useOvertimeMonthlySummary } from "@/hooks/useOvertimeRecords";
import type { OvertimeRecordWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  records: OvertimeRecordWithRelations[];
  currentUserId: string;
  isAdmin: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2.5 shadow-elevated text-xs space-y-1">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {payload.map((p: { name: string; value: number; color: string }) => (
          <div key={p.name} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: p.color }}
            />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-semibold text-foreground">{p.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  unit: string;
  colorClass: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3"
    >
      <div
        className={cn(
          "w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0 rounded-xl flex items-center justify-center",
          colorClass,
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        {/* Wraps on narrow cards instead of cutting the label off. */}
        <p
          title={label}
          className="text-[10px] text-muted-foreground uppercase tracking-wider lg:tracking-widest font-semibold leading-snug lg:truncate"
        >
          {label}
        </p>
        <p className="text-lg sm:text-xl font-bold text-foreground leading-tight">
          {value}
          <span className="text-sm font-normal text-muted-foreground ml-1">
            {unit}
          </span>
        </p>
      </div>
    </motion.div>
  );
}

export function MonthlySummaryChart({
  records,
  currentUserId,
  isAdmin,
}: Props) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  const { data: monthlySummary = [] } = useOvertimeMonthlySummary(year);

  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();

  const myRecords = isAdmin
    ? records
    : records.filter((r) => r.user_id === currentUserId);

  const thisMonthRecords = myRecords.filter((r) => {
    const d = parseISO(r.date);
    return d.getFullYear() === thisYear && d.getMonth() + 1 === thisMonth;
  });

  // Only approved rows count as real hours or days.
  const approvedThisMonth = thisMonthRecords.filter(
    (r) => r.status === "Approved",
  );

  const overtimeHoursThisMonth = approvedThisMonth
    .filter((r) => r.type === "Overtime")
    .reduce((sum, r) => sum + (r.duration_hours ?? 0), 0);

  const businessTripLocalThisMonth = approvedThisMonth.filter(
    (r) => r.type === "BusinessTrip_Local",
  ).length;
  const businessTripOutOfTownThisMonth = approvedThisMonth.filter(
    (r) => r.type === "BusinessTrip_OutOfTown",
  ).length;

  // The tile says "this month", so count this month only.
  const pendingCount = thisMonthRecords.filter(
    (r) => r.status === "Pending",
  ).length;

  const chartData = isAdmin
    ? monthlySummary
    : monthlySummary.map((m) => {
        const mr = records.filter((r) => {
          const d = parseISO(r.date);
          return (
            r.user_id === currentUserId &&
            r.status === "Approved" &&
            d.getFullYear() === year &&
            d.getMonth() + 1 === m.month
          );
        });
        return {
          ...m,
          overtimeHours: mr
            .filter((r) => r.type === "Overtime")
            .reduce((s, r) => s + (r.duration_hours ?? 0), 0),
          businessTripLocalDays: mr.filter(
            (r) => r.type === "BusinessTrip_Local",
          ).length,
          businessTripOutOfTownDays: mr.filter(
            (r) => r.type === "BusinessTrip_OutOfTown",
          ).length,
        };
      });

  return (
    <div className="flex flex-col gap-4">
      <div
        data-tour="overtime-stats"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <StatCard
          icon={Clock}
          label={t("overtime.stats.overtimeHours")}
          value={Math.round(overtimeHoursThisMonth * 10) / 10}
          unit={t("overtime.stats.hours")}
          colorClass="bg-amber-100 border border-amber-300 text-amber-700 dark:bg-amber-950/60 dark:border-amber-800/40 dark:text-amber-400"
        />
        <StatCard
          icon={MapPin}
          label={t("overtime.stats.businessTripLocalDays")}
          value={businessTripLocalThisMonth}
          unit={t("overtime.stats.days")}
          colorClass="bg-blue-100 border border-blue-300 text-blue-700 dark:bg-blue-950/60 dark:border-blue-800/40 dark:text-blue-400"
        />
        <StatCard
          icon={Plane}
          label={t("overtime.stats.businessTripOutOfTownDays")}
          value={businessTripOutOfTownThisMonth}
          unit={t("overtime.stats.days")}
          colorClass="bg-violet-100 border border-violet-300 text-violet-700 dark:bg-violet-950/60 dark:border-violet-800/40 dark:text-violet-400"
        />
        <StatCard
          icon={Timer}
          label={t("overtime.stats.pending")}
          value={pendingCount}
          unit=""
          colorClass="bg-secondary border border-border text-muted-foreground"
        />
      </div>

      <motion.div
        data-tour="overtime-chartline"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card rounded-xl p-5"
      >
        <h3 className="text-sm font-semibold text-foreground mb-4">
          {t("overtime.chart.title", { year })}
        </h3>
        <div style={{ height: 200 }}>
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
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) => (
                  <span style={{ color: "hsl(var(--muted-foreground))" }}>
                    {value}
                  </span>
                )}
              />
              <Bar
                dataKey="overtimeHours"
                name={t("overtime.chart.overtime")}
                fill="hsl(38 92% 50%)"
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
              />
              <Bar
                dataKey="businessTripLocalDays"
                name={t("overtime.chart.businessTripLocal")}
                fill="hsl(217 91% 55%)"
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
              />
              <Bar
                dataKey="businessTripOutOfTownDays"
                name={t("overtime.chart.businessTripOutOfTown")}
                fill="hsl(270 80% 60%)"
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
}
