import { format, formatDistanceToNow, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useTaskActivity } from "@/hooks/useTaskActivity";
import { useProfiles } from "@/hooks/useBoard";
import { useDateFnsLocale } from "@/lib/dateLocale";
import type { TaskActivity } from "@/lib/types";
import { useBoardCtx } from "./BoardContext";

function describe(a: TaskActivity, t: (k: string, o?: Record<string, unknown>) => string, name: (id: unknown) => string, column: (id: unknown) => string) {
  const d = a.detail;
  switch (a.action) {
    case "updated":
      return t("board.activity.updated", { field: t(`board.fields.${String(d.field)}`), to: d.to == null ? "-" : String(d.to) });
    case "moved":
      return t("board.activity.moved", { from: column(d.from), to: column(d.to) });
    case "assigned":
    case "unassigned":
      return t(`board.activity.${a.action}`, { name: name(d.user_id) });
    case "step_assigned":
      return t("board.activity.step_assigned", { title: String(d.title ?? ""), name: name(d.user_id) });
    case "step_added":
    case "step_checked":
    case "step_unchecked":
    case "step_removed":
      return t(`board.activity.${a.action}`, { title: String(d.title ?? "") });
    case "rejected":
    case "approved":
      return t(`board.activity.${a.action}`, { note: d.note ? `: ${String(d.note)}` : "" });
    default:
      return t(`board.activity.${a.action}`);
  }
}

export function TaskActivityFeed({ taskId }: { taskId: number }) {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();
  const { people, data } = useBoardCtx();
  const { data: items = [], isLoading } = useTaskActivity(taskId);
  const unknown = items
    .flatMap((a) => [a.actor_id, typeof a.detail.user_id === "string" ? a.detail.user_id : null])
    .filter((id): id is string => !!id && !people.has(id));
  const { data: extra = [] } = useProfiles(unknown);
  const profileOf = (id: string | null) =>
    id ? (people.get(id)?.profile ?? extra.find((p) => p.id === id) ?? null) : null;
  // An id with no readable profile is the superadmin's (profiles_select hides it).
  const name = (id: unknown) => profileOf(String(id))?.full_name ?? t("board.superadmin");
  const column = (id: unknown) => data.columns.find((c) => c.id === Number(id))?.name ?? "-";

  if (isLoading) return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  return (
    <ol className="space-y-3">
      {items.map((a) => {
        const actor = profileOf(a.actor_id);
        return (
          <li key={a.id} className="flex gap-2">
            <UserAvatar name={actor?.full_name ?? "?"} avatarUrl={actor?.avatar_url} size="sm" />
            <div className="min-w-0 text-xs">
              <p className="text-foreground">
                <span className="font-semibold">{actor?.full_name ?? (a.actor_id ? t("board.superadmin") : t("board.activity.system"))}</span>{" "}
                {describe(a, t, name, column)}
              </p>
              <p className="text-muted-foreground">
                <time dateTime={a.created_at} className="tabular-nums">
                  {format(parseISO(a.created_at), "d MMM yyyy, HH:mm:ss", { locale })}
                </time>
                {" · "}
                {formatDistanceToNow(parseISO(a.created_at), { addSuffix: true, locale })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
