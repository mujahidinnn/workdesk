import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Pencil, Eye, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Toolbar, SearchInput } from "@/components/master-hub/MasterSection";
import {
  useEmployeeRates,
  useUpsertEmployeeRate,
} from "@/hooks/useOvertimeRecords";
import type { EmployeeRate, Profile } from "@/lib/types";
import { useJobTitles } from "@/hooks/useJobTitles";
import { cn } from "@/lib/utils";

interface Props {
  profiles: Pick<Profile, "id" | "full_name">[];
  currentUserId: string;
}

type RateKey =
  | "base_salary"
  | "overtime_rate"
  | "local_trip_rate"
  | "out_of_town_rate";
type Rates = Record<RateKey, number>;

const EMPTY_RATES: Rates = {
  base_salary: 0,
  overtime_rate: 0,
  local_trip_rate: 0,
  out_of_town_rate: 0,
};

function formatIDR(n: number) {
  return n.toLocaleString("id-ID");
}

const TH =
  "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground";

export function EmployeeRatesPanel({ profiles, currentUserId }: Props) {
  const { t } = useTranslation();
  const jobTitles = useJobTitles();
  const { data: allRates = [], isLoading } = useEmployeeRates();
  const upsert = useUpsertEmployeeRate();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [draft, setDraft] = useState<Rates>(EMPTY_RATES);
  const [viewing, setViewing] = useState<EmployeeRate | null>(null);

  // One row per employee, since rates may not be configured yet.
  const rows = useMemo(() => {
    const byProfile = new Map(allRates.map((r) => [r.profile_id, r]));
    const q = search.trim().toLowerCase();
    return profiles
      .map((p) => ({
        id: p.id,
        name: p.full_name ?? p.id.slice(0, 8),
        title: jobTitles.byUser(p.id),
        rate: byProfile.get(p.id) ?? null,
      }))
      .filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          r.title?.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles, allRates, search, jobTitles]);

  function openEdit(row: (typeof rows)[number]) {
    setEditing({ id: row.id, name: row.name });
    setDraft(
      row.rate
        ? {
            base_salary: row.rate.base_salary,
            overtime_rate: row.rate.overtime_rate,
            local_trip_rate: row.rate.local_trip_rate,
            out_of_town_rate: row.rate.out_of_town_rate,
          }
        : EMPTY_RATES,
    );
  }

  function handleSave() {
    if (!editing) return;
    upsert.mutate(
      { profile_id: editing.id, updated_by: currentUserId, ...draft },
      { onSuccess: () => setEditing(null) },
    );
  }

  const rateFields: { key: RateKey; label: string }[] = [
    { key: "base_salary", label: t("overtime.rates.baseSalary") },
    { key: "overtime_rate", label: t("overtime.rates.overtimeRate") },
    { key: "local_trip_rate", label: t("overtime.rates.localRate") },
    { key: "out_of_town_rate", label: t("overtime.rates.outOfTownRate") },
  ];

  const rateCols: { key: RateKey; label: string; className: string }[] = [
    {
      key: "base_salary",
      label: t("overtime.rates.col.baseSalary"),
      className: "text-foreground",
    },
    {
      key: "overtime_rate",
      label: t("overtime.rates.col.overtime"),
      className: "text-amber-700 dark:text-amber-400",
    },
    {
      key: "local_trip_rate",
      label: t("overtime.rates.col.local"),
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      key: "out_of_town_rate",
      label: t("overtime.rates.col.outOfTown"),
      className: "text-violet-600 dark:text-violet-400",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {t("overtime.rates.title")}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("overtime.rates.subtitle")}
        </p>
      </div>

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("overtime.rates.search")}
        />
      </Toolbar>

      {isLoading ? (
        <div className="space-y-3 p-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-10 rounded-lg bg-secondary animate-pulse"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={t(
            search ? "overtime.rates.noResults" : "overtime.rates.empty",
          )}
        />
      ) : (
        <div className="overflow-auto scrollbar-thin">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={cn(TH, "text-left")}>
                  {t("overtime.rates.employee")}
                </th>
                {rateCols.map((c) => (
                  <th key={c.key} className={cn(TH, "text-right")}>
                    {c.label}
                  </th>
                ))}
                <th className={cn(TH, "text-left")}>
                  {t("overtime.rates.col.updated")}
                </th>
                <th className={cn(TH, "text-right")}>
                  {t("overtime.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/40 transition-colors hover:bg-secondary/20",
                    idx % 2 !== 0 && "bg-secondary/10",
                  )}
                >
                  <td className="px-3 py-3">
                    <span className="text-xs font-medium text-foreground">
                      {row.name}
                    </span>
                    {row.title && (
                      <span className="block max-w-[180px] truncate text-[10px] text-muted-foreground">
                        {row.title}
                      </span>
                    )}
                  </td>
                  {row.rate ? (
                    rateCols.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 py-3 text-right text-xs tabular-nums whitespace-nowrap",
                          c.className,
                        )}
                      >
                        {formatIDR(row.rate![c.key])}
                      </td>
                    ))
                  ) : (
                    <td colSpan={rateCols.length} className="px-3 py-3 text-right">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium text-muted-foreground bg-secondary border border-border">
                        {t("overtime.rates.notSet")}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {row.rate
                      ? format(new Date(row.rate.updated_at), "dd MMM yyyy")
                      : "-"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {row.rate && (
                        <button
                          onClick={() => setViewing(row.rate)}
                          title={t("common.detail")}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(row)}
                        title={t("common.edit")}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground text-base font-semibold">
              {t("overtime.rates.editTitle")}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{editing?.name}</p>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {rateFields.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-foreground">
                  {label}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono pointer-events-none">
                    {t("overtime.rates.currency")}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    value={draft[key] || ""}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [key]: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="bg-secondary border-border text-foreground text-sm h-9 pl-12"
                  />
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground hover:text-foreground"
              onClick={() => setEditing(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={upsert.isPending}
              onClick={handleSave}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {upsert.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  {t("overtime.rates.saving")}
                </>
              ) : (
                t("overtime.rates.save")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DetailDialog
        title={t("common.detail")}
        fields={
          viewing &&
          detailFields(
            viewing,
            t,
            profiles.find((p) => p.id === viewing.updated_by)?.full_name,
            jobTitles.byUser(viewing.profile_id),
          )
        }
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

function detailFields(
  row: EmployeeRate,
  t: (k: string) => string,
  updatedBy: string | null | undefined,
  jobTitle: string | undefined,
): DetailField[] {
  return [
    {
      label: t("overtime.rates.employee"),
      value: row.profile?.full_name ?? row.profile_id.slice(0, 8),
    },
    { label: t("master.employees.fields.roleTitle"), value: jobTitle },
    {
      label: t("overtime.rates.baseSalary"),
      value: `IDR ${formatIDR(row.base_salary)}`,
    },
    {
      label: t("overtime.rates.overtimeRate"),
      value: `IDR ${formatIDR(row.overtime_rate)}`,
    },
    {
      label: t("overtime.rates.localRate"),
      value: `IDR ${formatIDR(row.local_trip_rate)}`,
    },
    {
      label: t("overtime.rates.outOfTownRate"),
      value: `IDR ${formatIDR(row.out_of_town_rate)}`,
    },
    {
      label: t("overtime.detail.updatedAt"),
      value: format(new Date(row.updated_at), "dd MMM yyyy HH:mm"),
    },
    { label: t("overtime.detail.updatedBy"), value: updatedBy },
  ];
}
