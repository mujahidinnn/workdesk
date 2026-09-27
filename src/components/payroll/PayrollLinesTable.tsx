import { useState } from "react";
import { FileDown, Loader2, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({
    pph21: "",
    bpjs: "",
    other_deduction: "",
    deduction_note: "",
  });
  const [viewing, setViewing] = useState<PayrollLineWithName | null>(null);

  function startEdit(line: PayrollLineWithName) {
    setEditingId(line.id);
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
    setEditingId(null);
  }

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
            const isEditing = editingId === line.id;
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
                  className="px-3 py-2.5 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isEditing ? (
                    <div className="flex flex-col gap-1 items-end">
                      {(
                        [
                          ["pph21", t("payroll.deductions.pph21")],
                          ["bpjs", t("payroll.deductions.bpjs")],
                          ["other_deduction", t("payroll.deductions.other")],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 justify-end"
                        >
                          <span className="text-[10px] text-muted-foreground">
                            {label}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            value={draft[key]}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, [key]: e.target.value }))
                            }
                            className="h-7 w-28 text-right tabular-nums"
                          />
                        </label>
                      ))}
                      <Input
                        value={draft.deduction_note}
                        placeholder={t("payroll.deductions.note")}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            deduction_note: e.target.value,
                          }))
                        }
                        className="h-7 w-44 mt-1"
                      />
                      <div className="flex gap-1 mt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setEditingId(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          disabled={isSaving}
                          onClick={() => save(line)}
                        >
                          {isSaving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            t("common.save")
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!isDraft || !canManage}
                      onClick={() => startEdit(line)}
                      className={cn(
                        "tabular-nums",
                        deductionTotal
                          ? "text-amber-700 dark:text-amber-500"
                          : "text-muted-foreground/60",
                        isDraft &&
                          canManage &&
                          "hover:text-foreground cursor-pointer underline-offset-2 hover:underline",
                      )}
                    >
                      {deductionTotal ? `- ${money(deductionTotal)}` : "-"}
                    </button>
                  )}
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
