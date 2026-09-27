import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock, CalendarHeart, Plane, type LucideIcon } from "lucide-react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { useProjects } from "@/hooks/useProjects";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import { useHolidays } from "@/hooks/useHolidays";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { cn } from "@/lib/utils";
import { CLOSED_PROJECT_STATUSES } from "@/lib/types";

const LIMIT = 6;

function Card({
  title,
  icon: Icon,
  href,
  empty,
  children,
}: {
  title: string;
  icon: LucideIcon;
  href: string;
  empty: string;
  children: ReactNode[];
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="glass-card rounded-xl p-5 flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="flex-1 divide-y divide-border/60 text-xs">
        {children.length ? children : (
          <p className="py-6 text-center text-muted-foreground">{empty}</p>
        )}
      </div>
      <Link
        to={href}
        className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        {t("dashboard.upcoming.viewAll")}
        <ArrowRight className="w-3 h-3" />
      </Link>
    </motion.div>
  );
}

function Item({ title, sub, badge, tone }: { title: string; sub?: string; badge: string; tone?: "red" | "amber" }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{title}</p>
        {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
      </div>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
          tone === "red"
            ? "bg-destructive/10 text-destructive"
            : tone === "amber"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
              : "bg-secondary text-muted-foreground",
        )}
      >
        {badge}
      </span>
    </div>
  );
}

export function UpcomingCards() {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const fmt = (d: string) => format(parseISO(d), "d MMM", { locale });
  const daysUntil = (d: string) => differenceInCalendarDays(parseISO(d), today);

  const { data: projects = [] } = useProjects();
  const { data: leaves = [] } = useLeaveRequests({
    status: "Approved",
    from: todayStr,
    to: format(addDays(today, 14), "yyyy-MM-dd"),
  });
  const { data: holidays = [] } = useHolidays();

  const deadlines = projects
    .filter((p) => p.end_date && !CLOSED_PROJECT_STATUSES.includes(p.work_status?.status_name ?? ""))
    .filter((p) => daysUntil(p.end_date!) <= 30)
    .sort((a, b) => a.end_date!.localeCompare(b.end_date!))
    .slice(0, LIMIT);

  const upcomingLeave = [...leaves]
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, LIMIT);

  const upcomingHolidays = holidays.filter((h) => h.date >= todayStr).slice(0, LIMIT);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card
        title={t("dashboard.upcoming.deadlines")}
        icon={CalendarClock}
        href="/timeline"
        empty={t("dashboard.upcoming.noDeadlines")}
      >
        {deadlines.map((p) => {
          const n = daysUntil(p.end_date!);
          return (
            <Item
              key={p.id}
              title={p.project_name}
              sub={`${p.project_code} · ${fmt(p.end_date!)}`}
              badge={
                n < 0
                  ? t("dashboard.upcoming.overdue", { count: -n })
                  : n === 0
                    ? t("dashboard.upcoming.today")
                    : t("dashboard.upcoming.inDays", { count: n })
              }
              tone={n < 0 ? "red" : n <= 7 ? "amber" : undefined}
            />
          );
        })}
      </Card>

      <Card
        title={t("dashboard.upcoming.leave")}
        icon={Plane}
        href="/leave"
        empty={t("dashboard.upcoming.noLeave")}
      >
        {upcomingLeave.map((l) => (
          <Item
            key={l.id}
            title={l.submitter?.full_name ?? "-"}
            sub={t(`leave.type.${l.type}`)}
            badge={
              l.start_date === l.end_date
                ? fmt(l.start_date)
                : `${fmt(l.start_date)} – ${fmt(l.end_date)}`
            }
            tone={l.start_date <= todayStr ? "amber" : undefined}
          />
        ))}
      </Card>

      <Card
        title={t("dashboard.upcoming.holidays")}
        icon={CalendarHeart}
        href="/calendar"
        empty={t("dashboard.upcoming.noHolidays")}
      >
        {upcomingHolidays.map((h) => {
          const n = daysUntil(h.date);
          return (
            <Item
              key={h.id}
              title={h.name}
              sub={format(parseISO(h.date), "EEEE, d MMM yyyy", { locale })}
              badge={n === 0 ? t("dashboard.upcoming.today") : t("dashboard.upcoming.inDays", { count: n })}
              tone={n <= 7 ? "amber" : undefined}
            />
          );
        })}
      </Card>
    </div>
  );
}
