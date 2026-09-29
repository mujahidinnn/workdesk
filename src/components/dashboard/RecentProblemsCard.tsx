import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import type { DailyTaskWithRelations } from "@/lib/types";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useEmployeeAvatarMap } from "@/hooks/useEmployeeAvatars";
import { useAuth } from "@/context/auth";
import { DetailDialog } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import { taskDetailFields } from "@/components/daily-report/detailFields";

const FOOTER_LINK =
  "flex-1 flex items-center justify-center gap-1.5 rounded-md border border-border py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors";

/** Small donut; the number is the point, the ring only hints at it. */
function ProgressRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 14;
  const c = 2 * Math.PI * r;
  const color =
    pct >= 80
      ? "text-emerald-500"
      : pct >= 40
        ? "text-amber-500"
        : "text-rose-500";
  return (
    <div
      className="relative w-9 h-9 flex-shrink-0 self-center"
      role="img"
      aria-label={`${pct}%`}
    >
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-border" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className={color}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

interface RecentProblemsCardProps {
  tasks: DailyTaskWithRelations[];
}

export function RecentProblemsCard({ tasks }: RecentProblemsCardProps) {
  const avatarMap = useEmployeeAvatarMap();
  const { t } = useTranslation();
  const { canRead } = useAuth();
  const [viewing, setViewing] = useState<DailyTaskWithRelations | null>(
    null,
  );
  const problemTasks = tasks.filter(
    (task) =>
      !task.is_resolved &&
      task.problem_desc &&
      task.problem_desc.trim().length > 0,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="glass-card rounded-xl p-5 flex flex-col h-full"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {t("dashboard.problems.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("dashboard.problems.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-100 border border-amber-300 dark:bg-amber-950 dark:border-amber-800/40">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
            {t("dashboard.problems.active", { count: problemTasks.length })}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2 min-h-0">
        {problemTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
            <p className="text-sm font-medium text-foreground">
              {t("dashboard.problems.allClear")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("dashboard.problems.noProblems")}
            </p>
          </div>
        ) : (
          problemTasks.map((task, i) => {
            const empName = task.employee?.full_name || "?";
            return (
              <motion.div
                key={task.id}
                {...detailRowProps(() => setViewing(task))}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                // Cap the stagger: 70 items must not take 3.5s to appear.
                transition={{ delay: 0.3 + Math.min(i, 8) * 0.05 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 hover:border-amber-300 dark:bg-amber-950/30 dark:border-amber-800/20 dark:hover:border-amber-700/40 transition-colors group cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
              >
                <UserAvatar
                  name={empName}
                  avatarUrl={avatarMap[task.employee_id]?.avatarUrl}
                  colorIndex={task.employee_id}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-foreground truncate">
                      {empName}
                    </span>
                    {task.employee?.role_title && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {task.employee.role_title}
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono">
                      {task.project?.project_code
                        ?.split("-")
                        .slice(0, 2)
                        .join("-")}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {format(new Date(task.date), "dd MMM")}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5 mt-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 leading-snug line-clamp-2">
                      {task.problem_desc}
                    </p>
                  </div>
                </div>
                <ProgressRing value={task.progress_pct} />
              </motion.div>
            );
          })
        )}
      </div>

      {problemTasks.length > 0 && canRead("issues") && (
        <Link
          to="/issues"
          className="mt-3 pt-3 border-t border-border flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("dashboard.problems.viewAll")}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}

      <DetailDialog
        title={t("common.detail")}
        fields={viewing && taskDetailFields(viewing, t)}
        onClose={() => setViewing(null)}
        footer={
          viewing && (
            <>
              {canRead("daily-report") && (
                <Link
                  to={`/daily-report?employee=${viewing.employee_id}&from=${viewing.date}&to=${viewing.date}`}
                  className={FOOTER_LINK}
                >
                  {t("dashboard.openInDailyReport")}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
              {canRead("issues") && (
                <Link to="/issues" className={FOOTER_LINK}>
                  {t("dashboard.openInIssueLog")}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </>
          )
        }
      />
    </motion.div>
  );
}
