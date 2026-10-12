import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import { WorkloadTable } from "@/components/board/WorkloadTable";
import { useDivisions } from "@/hooks/useDivisions";
import { useTaskWorkload } from "@/hooks/useTaskWorkload";
import { useUsers } from "@/hooks/useUsers";
import type { BoardMember } from "@/lib/types";

export function TaskWorkloadCard() {
  const { t } = useTranslation();
  const [division, setDivision] = useState<string>();
  const { data: divisions = [] } = useDivisions();
  const { data } = useTaskWorkload(division ? Number(division) : undefined);
  const { data: users = [] } = useUsers();
  const people = useMemo<BoardMember[]>(
    () =>
      users
        .filter((u) => data?.counts.has(u.id) || data?.steps.has(u.id))
        .map((u) => ({ user_id: u.id, member_role: "member", profile: { id: u.id, full_name: u.full_name, avatar_url: u.avatar_url } })),
    [users, data],
  );
  if (!data || (people.length === 0 && !division)) return null;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("board.workload.dashboardTitle")}</h2>
        <FilterSelect
          value={division}
          onChange={setDivision}
          allLabel={t("board.filter.allDivisions")}
          options={divisions.map((d) => ({ value: String(d.id), label: d.name }))}
        />
      </div>
      {people.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("board.workload.empty")}</p>
      ) : (
        <WorkloadTable counts={data.counts} steps={data.steps} members={people} />
      )}
    </section>
  );
}
