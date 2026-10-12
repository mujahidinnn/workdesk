import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDays, format, parseISO } from "date-fns";
import { ListChecks, ListTodo } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/EmptyState";
import { STATUS_STYLE } from "@/components/board/taskStyles";
import { useAuth } from "@/context/auth";
import { useMyTasks, type MyTask } from "@/hooks/useMyTasks";
import { canReviewTask } from "@/lib/taskPermissions";
import { isSentBack } from "@/lib/taskTree";
import { cn } from "@/lib/utils";

type Group = "overdue" | "today" | "week" | "later" | "noDue";

function groupOf(task: MyTask, today: string, week: string): Group {
  if (!task.due_date) return "noDue";
  if (task.due_date < today) return "overdue";
  if (task.due_date === today) return "today";
  if (task.due_date <= week) return "week";
  return "later";
}

function TaskLine({ task }: { task: MyTask }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/boards/${task.board.id}?task=${task.task_no}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/40"
    >
      <span className="font-mono text-xs text-muted-foreground">#{task.task_no}</span>
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      <span className="hidden text-xs text-muted-foreground sm:inline">{task.board.name}</span>
      {isSentBack(task) ? (
        <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-600 dark:text-red-400">{t("board.sentBack")}</span>
      ) : (
        <span className={cn("rounded px-1.5 py-0.5 text-[11px]", STATUS_STYLE[task.status])}>{t(`board.status.${task.status}`)}</span>
      )}
      {task.due_date && <span className="text-xs tabular-nums text-muted-foreground">{format(parseISO(task.due_date), "d MMM")}</span>}
    </Link>
  );
}

export default function MyTasksPage() {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const { data, isLoading } = useMyTasks();
  const [tab, setTab] = useState<"mine" | "review">("mine");

  const groups = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const week = format(addDays(new Date(), 7), "yyyy-MM-dd");
    const out: Record<Group, MyTask[]> = { overdue: [], today: [], week: [], later: [], noDue: [] };
    for (const task of data?.assigned ?? []) if (task.status !== "done") out[groupOf(task, today, week)].push(task);
    for (const list of Object.values(out)) list.sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
    return out;
  }, [data]);

  const toReview = useMemo(
    () =>
      (data?.toReview ?? []).filter((task) =>
        canReviewTask({ userId: user?.id ?? "", isAdmin: isAdmin(), memberRole: data?.roles[task.board.project_id] ?? null }, task),
      ),
    [data, user?.id, isAdmin],
  );

  const tabs = [
    { id: "mine" as const, label: t("board.myTasks.mine") },
    { id: "review" as const, label: t("board.myTasks.review", { count: toReview.length }) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t("board.myTasks.title")}</h1>
        <div className="flex gap-0.5 rounded-lg border border-border bg-segment p-0.5">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium", tab === x.id ? "border border-border bg-card shadow-sm" : "text-muted-foreground")}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : tab === "review" ? (
        toReview.length ? (
          <div className="space-y-2">{toReview.map((task) => <TaskLine key={task.id} task={task} />)}</div>
        ) : (
          <EmptyState icon={ListTodo} title={t("board.myTasks.noReview")} />
        )
      ) : Object.values(groups).every((g) => g.length === 0) && !data?.steps.length ? (
        <EmptyState icon={ListTodo} title={t("board.myTasks.empty")} />
      ) : (
        <>
        {data && data.steps.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">
              {t("board.myTasks.steps")} <span className="font-normal text-muted-foreground">{data.steps.length}</span>
            </h2>
            {data.steps.map((s) => (
              <Link
                key={s.id}
                to={`/boards/${s.task.board.id}?task=${s.task.task_no}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/40"
              >
                <ListChecks className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                  #{s.task.task_no} {s.task.title} · {s.task.board.name}
                </span>
                {s.task.due_date && <span className="text-xs tabular-nums text-muted-foreground">{format(parseISO(s.task.due_date), "d MMM")}</span>}
              </Link>
            ))}
          </section>
        )}
        {(Object.keys(groups) as Group[]).filter((g) => groups[g].length).map((g) => (
          <section key={g} className="space-y-2">
            <h2 className={cn("text-sm font-semibold", g === "overdue" && "text-red-500")}>
              {t(`board.myTasks.groups.${g}`)} <span className="font-normal text-muted-foreground">{groups[g].length}</span>
            </h2>
            {groups[g].map((task) => <TaskLine key={task.id} task={task} />)}
          </section>
        ))}
        </>
      )}
    </div>
  );
}
