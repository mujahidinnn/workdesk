import { useState } from "react";
import { FileDown, Pencil, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import { downloadPayslips } from "@/lib/payslip";
import type { PayrollLineWithName } from "@/lib/types";
import { cn } from "@/lib/utils";

const money = (n: number) => Math.round(n).toLocaleString("id-ID");

interface Props {
  lines: PayrollLineWithName[];
  period: string;
  companyName: string;
  /** A finalized run is read-only except for the payment flag. */
  isDraft: boolean;
  canManage: boolean;
  onSaveDeductions: (payload: {
    id: number;
    pph21: number;
    bpjs: number;
    other_deduction: number;
    deduction_note: string | null;
  }) => void;
  onTogglePaid: (payload: { id: number; paid: boolean }) => void;
  isSaving: boolean;
}

/** Only deductions are editable; everything else on the row is computed server-side. */
export function PayrollLinesTable({
  lines,
  period,
  isDraft,
  canManage,
  onSaveDeductions,
  onTogglePaid,
  isSaving,
  companyName,
}: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<PayrollLineWithName | null>(null);
  const [draft, setDraft] = useState({
    pph21: "",
    bpjs: "",
    other_deduction: "",
    deduction_note: "",
  });
  const [viewing, setViewing] = useState<PayrollLineWithName | null>(null);

  function startEdit(line: PayrollLineWithName) {
    setEditing(line);
    setDraft({
      pph21: String(line.pph21 || ""),
      bpjs: String(line.bpjs || ""),
      other_deduction: String(line.other_deduction || ""),
      deduction_note: line.deduction_note ?? "",
    });
  }

  function save(line: PayrollLineWithName) {
    onSaveDeductions({
      id: line.id,
      pph21: Number(draft.pph21) || 0,
      bpjs: Number(draft.bpjs) || 0,
      other_deduction: Number(draft.other_deduction) || 0,
      deduction_note: draft.deduction_note.trim() || null,
    });
    setEditing(null);
  }

  const draftTotal =
    (Number(draft.pph21) || 0) +
    (Number(draft.bpjs) || 0) +
    (Number(draft.other_deduction) || 0);

  if (!lines.length) {
    return <EmptyState icon={Wallet} title={t("payroll.empty")} />;
  }

  return (
    <>
    <div className="glass-card rounded-xl overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left font-medium px-3 py-2.5">
              {t("payroll.table.employee")}
            </th>
            <th className="text-right font-medium px-3 py-2.5">
              {t("payroll.table.base")}
            </th>
            <th className="text-right font-medium px-3 py-2.5">
              {t("payroll.table.overtime")}
            </th>
            <th className="text-right font-medium px-3 py-2.5">
              {t("payroll.table.trips")}
            </th>
            <th className="text-right font-medium px-3 py-2.5">
              {t("payroll.table.gross")}
            </th>
            <th className="text-right font-medium px-3 py-2.5">
              {t("payroll.table.deductions")}
            </th>
            <th className="text-right font-medium px-3 py-2.5">
              {t("payroll.table.net")}
            </th>
            <th className="text-center font-medium px-3 py-2.5">
              {t("payroll.table.payment")}
            </th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const deductionTotal =
              line.pph21 + line.bpjs + line.other_deduction;
            return (
              <tr
                key={line.id}
                {...detailRowProps(() => setViewing(line))}
                className="border-b border-border/50 last:border-0 hover:bg-secondary/20 cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
              >
                <td className="px-3 py-2.5 text-foreground font-medium">
                  {line.name}
                  {line.job_title && (
                    <span className="block max-w-[160px] truncate text-[10px] font-normal text-muted-foreground">
                      {line.job_title}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {money(line.base_salary)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {money(line.overtime_pay)}
                  <span className="text-[10px] text-muted-foreground/60 ml-1">
                    {line.overtime_hours}j
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {money(line.local_trip_pay + line.out_of_town_pay)}
                  <span className="text-[10px] text-muted-foreground/60 ml-1">
                    {line.local_trip_days + line.out_of_town_days}h
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                  {money(line.gross)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right tabular-nums",
                    deductionTotal
                      ? "text-amber-700 dark:text-amber-500"
                      : "text-muted-foreground/60",
                  )}
                >
                  {deductionTotal ? `- ${money(deductionTotal)}` : "-"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-500">
                  {money(line.net)}
                </td>
                <td
                  className="px-3 py-2.5 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() =>
                      onTogglePaid({
                        id: line.id,
                        paid: line.payment_status !== "Paid",
                      })
                    }
                    className={cn(
                      "px-2 py-1 rounded-md text-[10px] font-medium border",
                      line.payment_status === "Paid"
                        ? "text-emerald-700 border-emerald-300 bg-emerald-100 dark:text-emerald-500 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                        : "text-muted-foreground border-border",
                      canManage && "hover:border-foreground/40",
                    )}
                  >
                    {t(`payroll.payment.${line.payment_status}`)}
                  </button>
                </td>
                <td
                  className="px-3 py-2.5 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isDraft && canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title={t("payroll.table.deductions")}
                      aria-label={t("payroll.table.deductions")}
                      onClick={() => startEdit(line)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-[11px]"
                    onClick={() => downloadPayslips([line], period, companyName)}
                  >
                    <FileDown className="w-3 h-3" />
                    {t("payroll.slip")}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("payroll.table.deductions")}</DialogTitle>
            <DialogDescription>{editing?.name}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (editing) save(editing);
            }}
          >
            {(
              [
                ["pph21", t("payroll.deductions.pph21")],
                ["bpjs", t("payroll.deductions.bpjs")],
                ["other_deduction", t("payroll.deductions.other")],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="grid gap-1.5 text-xs font-medium">
                {label}
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                  className="text-right tabular-nums"
                />
              </label>
            ))}
            <label className="grid gap-1.5 text-xs font-medium">
              {t("payroll.deductions.note")}
              <Input
                value={draft.deduction_note}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, deduction_note: e.target.value }))
                }
              />
            </label>
            {editing && (
              <dl className="rounded-lg bg-secondary/40 px-3 py-2 text-xs space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("payroll.table.gross")}</dt>
                  <dd>{money(editing.gross)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("payroll.table.deductions")}</dt>
                  <dd className="text-amber-700 dark:text-amber-500">- {money(draftTotal)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>{t("payroll.table.net")}</dt>
                  <dd className="text-emerald-600 dark:text-emerald-500">
                    {money(editing.gross - draftTotal)}
                  </dd>
                </div>
              </dl>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSaving}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DetailDialog
        title={t("common.detail")}
        fields={viewing && detailFields(viewing, t)}
        onClose={() => setViewing(null)}
      />
    </>
  );
}

function detailFields(
  line: PayrollLineWithName,
  t: (k: string) => string,
): DetailField[] {
  const deductionTotal = line.pph21 + line.bpjs + line.other_deduction;
  return [
    { label: t("payroll.table.employee"), value: line.name },
    { label: t("master.employees.fields.roleTitle"), value: line.job_title },
    { label: t("payroll.table.base"), value: money(line.base_salary) },
    {
      label: t("payroll.table.overtime"),
      value: `${money(line.overtime_pay)} (${line.overtime_hours}j)`,
    },
    {
      label: t("overtime.type.BusinessTrip_Local"),
      value: `${money(line.local_trip_pay)} (${line.local_trip_days}h)`,
    },
    {
      label: t("overtime.type.BusinessTrip_OutOfTown"),
      value: `${money(line.out_of_town_pay)} (${line.out_of_town_days}h)`,
    },
    { label: t("payroll.table.gross"), value: money(line.gross) },
    { label: t("payroll.deductions.pph21"), value: money(line.pph21) },
    { label: t("payroll.deductions.bpjs"), value: money(line.bpjs) },
    { label: t("payroll.deductions.other"), value: money(line.other_deduction) },
    {
      label: t("payroll.table.deductions"),
      value: deductionTotal ? `- ${money(deductionTotal)}` : "-",
    },
    {
      label: t("payroll.table.net"),
      value: (
        <span className="font-semibold text-emerald-600 dark:text-emerald-500">
          {money(line.net)}
        </span>
      ),
    },
    {
      label: t("payroll.table.payment"),
      value: t(`payroll.payment.${line.payment_status}`),
    },
    {
      label: t("payroll.detail.paidAt"),
      value: line.paid_at && format(parseISO(line.paid_at), "dd MMM yyyy"),
    },
    {
      label: t("payroll.detail.deductionNote"),
      value: line.deduction_note,
      block: true,
    },
  ];
}
