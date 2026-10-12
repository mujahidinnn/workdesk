import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import { emptyCounts, openCount, type WorkloadCounts } from "@/lib/workload";
import type { BoardMember } from "@/lib/types";

const COLS: (keyof WorkloadCounts)[] = ["todo", "in_progress", "in_review", "overdue", "done_7d"];

export function WorkloadTable({
  counts,
  steps,
  members,
  onPick,
}: {
  counts: Map<string, WorkloadCounts>;
  steps?: Map<string, number>;
  members: BoardMember[];
  onPick?: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(
    () =>
      members
        .map((m) => ({ m, c: counts.get(m.user_id) ?? emptyCounts() }))
        .sort((a, b) => openCount(b.c) - openCount(a.c)),
    [counts, members],
  );
  const max = Math.max(1, ...rows.map((r) => openCount(r.c)));

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">{t("board.workload.person")}</th>
            <th className="px-3 py-2 font-medium">{t("board.workload.open")}</th>
            {COLS.map((c) => <th key={c} className="px-3 py-2 font-medium">{t(`board.workload.${c}`)}</th>)}
            {steps && <th className="px-3 py-2 font-medium">{t("board.workload.steps")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, c }) => (
            <tr
              key={m.user_id}
              className={cn("border-b border-border", onPick && "cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40 outline-none")}
              tabIndex={onPick ? 0 : undefined}
              onClick={() => onPick?.(m.user_id)}
              onKeyDown={(e) => e.key === "Enter" && onPick?.(m.user_id)}
            >
              <td className="flex items-center gap-2 px-3 py-2">
                <UserAvatar name={m.profile?.full_name ?? "?"} avatarUrl={m.profile?.avatar_url} size="sm" />
                {m.profile?.full_name}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${(openCount(c) / max) * 100}%` }} />
                  </div>
                  <span className="tabular-nums">{openCount(c)}</span>
                </div>
              </td>
              {COLS.map((k) => (
                <td key={k} className={cn("px-3 py-2 tabular-nums", k === "overdue" && c.overdue > 0 && "font-semibold text-red-500")}>{c[k]}</td>
              ))}
              {steps && <td className="px-3 py-2 tabular-nums">{steps.get(m.user_id) ?? 0}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
