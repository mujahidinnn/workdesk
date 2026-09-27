import { motion } from "framer-motion";
import {
  ClipboardList,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  UserCheck,
  Clock,
  CalendarOff,
  Inbox,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { ProductivityGauge } from "@/components/dashboard/ProductivityGauge";
import { TasksPerProjectChart } from "@/components/dashboard/TasksPerProjectChart";
import { RecentProblemsCard } from "@/components/dashboard/RecentProblemsCard";
import { WorkloadHeatmap } from "@/components/dashboard/WorkloadHeatmap";
import {
  useDashboardSummary,
  useTasksPerProject,
  useDailyTasks,
} from "@/hooks/useDailyTasks";
import { useHrisSummary } from "@/hooks/useHrisSummary";
import { useAuth } from "@/context/auth";

export default function DashboardPage() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const { data: summary } = useDashboardSummary();
  const { data: perProject = [] } = useTasksPerProject();
  const { data: tasks = [] } = useDailyTasks();
  const { data: hris } = useHrisSummary();

  const stats = summary ?? {
    totalTasks: 0,
    avgProgress: 0,
    activeProblems: 0,
    completedTasks: 0,
  };
  const firstName = profile?.full_name?.split(" ")[0] ?? "Team";

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="text-xl font-bold text-foreground">
          {t("dashboard.greeting", { name: firstName })}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {t("dashboard.subtitle")}
        </p>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div data-tour="dashboard-stat-total">
          <StatsCard
            title={t("dashboard.stats.totalTasks")}
            value={stats.totalTasks}
            subtitle={t("dashboard.stats.allTime")}
            icon={ClipboardList}
            variant="emerald"
          />
        </div>
        <div data-tour="dashboard-stat-progress">
          <StatsCard
            title={t("dashboard.stats.avgProgress")}
            value={`${Math.round(stats.avgProgress)}%`}
            subtitle={t("dashboard.stats.teamAverage")}
            icon={TrendingUp}
            variant="default"
          />
        </div>
        <div data-tour="dashboard-stat-completed">
          <StatsCard
            title={t("dashboard.stats.completed")}
            value={stats.completedTasks}
            subtitle={t("dashboard.stats.fullProgress")}
            icon={CheckCircle}
            variant="emerald"
          />
        </div>
        <div data-tour="dashboard-stat-problems">
          <StatsCard
            title={t("dashboard.stats.activeProblems")}
            value={stats.activeProblems}
            subtitle={t("dashboard.stats.needAttention")}
            icon={AlertTriangle}
            variant="amber"
          />
        </div>

        {/* Same grid as the KPIs so every row keeps one height and gap. */}
        <StatsCard
          title={t("dashboard.hris.presentToday")}
          value={`${hris?.presentToday ?? 0}/${hris?.headcount ?? 0}`}
          subtitle={t("dashboard.hris.ofHeadcount")}
          icon={UserCheck}
          variant="emerald"
        />
        <StatsCard
          title={t("dashboard.hris.lateToday")}
          value={hris?.lateToday ?? 0}
          subtitle={t("dashboard.hris.pastTolerance")}
          icon={Clock}
          variant={hris?.lateToday ? "amber" : "default"}
        />
        <StatsCard
          title={t("dashboard.hris.onLeaveToday")}
          value={hris?.onLeaveToday ?? 0}
          subtitle={t("dashboard.hris.leaveSickPermit")}
          icon={CalendarOff}
          variant="default"
        />
        <StatsCard
          title={t("dashboard.hris.pendingApprovals")}
          value={(hris?.pendingOvertime ?? 0) + (hris?.pendingLeave ?? 0)}
          subtitle={t("dashboard.hris.overtimeHoursMonth", {
            hours: Math.round((hris?.overtimeHoursThisMonth ?? 0) * 10) / 10,
          })}
          icon={Inbox}
          variant={
            (hris?.pendingOvertime ?? 0) + (hris?.pendingLeave ?? 0)
              ? "amber"
              : "default"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div data-tour="dashboard-chart" className="lg:col-span-2">
          <TasksPerProjectChart data={perProject} />
        </div>
        <div data-tour="dashboard-gauge">
          <ProductivityGauge
            avgProgress={Math.round(stats.avgProgress)}
            totalTasks={stats.totalTasks}
            completedTasks={stats.completedTasks}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
        {/* The list never sets the row height: the heatmap does (desktop),
            a fixed height does (mobile), and the list scrolls inside. */}
        <div
          data-tour="dashboard-problems"
          className="lg:col-span-2 relative h-[420px] lg:h-auto lg:min-h-[320px]"
        >
          <div className="absolute inset-0">
            <RecentProblemsCard tasks={tasks} />
          </div>
        </div>
        <div data-tour="dashboard-workload" className="lg:col-span-3">
          <WorkloadHeatmap />
        </div>
      </div>
    </div>
  );
}
