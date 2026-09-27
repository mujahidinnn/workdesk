import { useMemo, useState, type ReactNode } from "react";
import type { RowInput, UserOptions } from "jspdf-autotable";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import {
  CalendarCheck,
  Download,
  FileText,
  Sheet,
  Table,
  Loader2,
  CheckCircle,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttendancePeriodFilter } from "@/components/attendance/AttendancePeriodFilter";
import { useDailyTasks } from "@/hooks/useDailyTasks";
import { useEmployees } from "@/hooks/useEmployees";
import { useJobTitles } from "@/hooks/useJobTitles";
import { useProjects } from "@/hooks/useProjects";
import {
  useEmployeeRates,
  useOvertimeRecords,
} from "@/hooks/useOvertimeRecords";
import { useAttendance } from "@/hooks/useAttendance";
import { useHolidays } from "@/hooks/useHolidays";
import { useWorkSchedule } from "@/hooks/useWorkSchedule";
import { useUsers } from "@/hooks/useUsers";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { isEarlyLeave, isLateArrival, workHours } from "@/lib/attendance";
import { countWorkdays, periodRange } from "@/lib/workday";
import { payrollRecap } from "@/lib/payroll";
import type { PeriodType } from "@/lib/period";
import type {
  AttendanceStatus,
  AttendanceWithProfile,
  DailyTaskWithRelations,
  EmployeeRate,
  OvertimeRecordWithRelations,
  UserWithEmail,
  WorkSchedule,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  PDF_MARGIN,
  PDF_TOP,
  INK,
  brandPdfPages,
  brandSheet,
  newWorkbook,
  pdfTableStyle,
  registerPdfFont,
  saveWorkbook,
} from "@/lib/exportBrand";

type ExportStatus = "idle" | "generating" | "done";

const TASKS_TITLE = "Laporan Tugas Harian";

/** The filter part of buildTitle(), for the line under the report title. */
function taskFilters(title: string) {
  return title.split(" · ").slice(1).join(" · ") || "Semua periode";
}

async function exportExcel(
  tasks: DailyTaskWithRelations[],
  title: string,
  company: string,
) {
  const { wb, logo } = await newWorkbook(company);
  const ws = wb.addWorksheet("Daily Report");

  ws.columns = [
    { header: "Tanggal", key: "date", width: 14 },
    { header: "Karyawan", key: "employee", width: 22 },
    { header: "Jabatan", key: "role", width: 20 },
    { header: "Kode Proyek", key: "project_code", width: 16 },
    { header: "Nama Proyek", key: "project_name", width: 30 },
    { header: "Uraian Tugas", key: "task_desc", width: 45 },
    { header: "Progres (%)", key: "progress", width: 13 },
    { header: "Keterangan/Problem", key: "problem", width: 40 },
    { header: "Selesai", key: "resolved", width: 11 },
  ];
  ws.getColumn("progress").alignment = { horizontal: "center" };
  ws.getColumn("resolved").alignment = { horizontal: "center" };

  tasks.forEach((t) => {
    ws.addRow({
      date: format(parseISO(t.date), "dd MMM yyyy"),
      employee: t.employee?.full_name ?? "",
      role: t.employee?.role_title ?? "",
      project_code: t.project?.project_code ?? "",
      project_name: t.project?.project_name ?? "",
      task_desc: t.task_desc,
      progress: t.progress_pct,
      problem: t.problem_desc ?? "",
      resolved: t.is_resolved ? "Ya" : "",
    });
  });

  brandSheet(wb, ws, {
    company,
    title: TASKS_TITLE,
    subtitle: `${taskFilters(title)} · ${tasks.length} data`,
    logo,
  });
  await saveWorkbook(wb, `${title.replace(/\s+/g, "_")}.xlsx`);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function exportCSV(tasks: DailyTaskWithRelations[], title: string) {
  const headers = [
    "Date",
    "Employee",
    "Role",
    "Project Code",
    "Project Name",
    "Task Description",
    "Progress (%)",
    "Keterangan/Problem",
    "Resolved",
  ];
  const rows = tasks.map((t) => [
    format(parseISO(t.date), "dd MMM yyyy"),
    t.employee?.full_name ?? "",
    t.employee?.role_title ?? "",
    t.project?.project_code ?? "",
    t.project?.project_name ?? "",
    t.task_desc,
    String(t.progress_pct),
    t.problem_desc ?? "",
    t.is_resolved ? "Yes" : "",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  // The BOM keeps Indonesian characters readable when Excel on Windows opens it.
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type PdfTable = {
  /** Heading above the table, for files with more than one. */
  caption?: string;
  head: string[];
  body: RowInput[];
  columnStyles?: UserOptions["columnStyles"];
};

/** Each table after the first starts on its own page. */
async function exportPDF(
  company: string,
  title: string,
  /** Line under the title: period, filters, record count. */
  subtitle: string,
  tables: PdfTable[],
  fileName: string,
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const font = await registerPdfFont(doc);

  tables.forEach((table, index) => {
    if (index > 0) doc.addPage();
    let startY = PDF_TOP;
    if (table.caption) {
      doc.setFont(font, "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...INK);
      doc.text(table.caption, PDF_MARGIN, startY + 1);
      startY += 5;
    }
    autoTable(doc, {
      ...pdfTableStyle(font),
      startY,
      head: [table.head],
      body: table.body,
      columnStyles: table.columnStyles,
    });
  });

  await brandPdfPages(doc, { company, title, subtitle, font });
  doc.save(fileName);
}

async function exportTasksPDF(
  tasks: DailyTaskWithRelations[],
  title: string,
  company: string,
) {
  await exportPDF(
    company,
    TASKS_TITLE,
    `${taskFilters(title)} · ${tasks.length} data`,
    [
      {
        head: [
          "Tanggal",
          "Karyawan",
          "Proyek",
          "Uraian Tugas",
          "Progres",
          "Keterangan/Problem",
          "Selesai",
        ],
        body: tasks.map((t) => [
          format(parseISO(t.date), "dd MMM yy"),
          t.employee?.full_name ?? "",
          t.project?.project_code ?? "",
          t.task_desc,
          `${t.progress_pct}%`,
          t.problem_desc ?? "",
          t.is_resolved ? "Ya" : "",
        ]),
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 32 },
          2: { cellWidth: 22 },
          3: { cellWidth: 70 },
          4: { cellWidth: 18, halign: "center" },
          5: { cellWidth: 70 },
          6: { cellWidth: 16, halign: "center" },
        },
      },
    ],
    `${title.replace(/\s+/g, "_")}.pdf`,
  );
}

async function exportOvertimeExcel(
  records: OvertimeRecordWithRelations[],
  rates: EmployeeRate[],
  fileName: string,
  /** Period and status line, so the sheet says what it was filtered by. */
  subtitle: string,
  /** True only when the export covers exactly one month, see payrollRecap. */
  monthlyPeriod: boolean,
  company: string,
  jobTitle: (userId: string) => string | undefined,
) {
  const { wb, logo } = await newWorkbook(company);

  const wsOT = wb.addWorksheet("Lembur");
  wsOT.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Tanggal", key: "date", width: 14 },
    { header: "Nama Karyawan", key: "employee", width: 24 },
    { header: "Jam Mulai", key: "start", width: 12 },
    { header: "Jam Selesai", key: "end", width: 12 },
    { header: "Durasi (Jam)", key: "duration", width: 14 },
    { header: "Kode Proyek", key: "project", width: 16 },
    { header: "Uraian Kegiatan", key: "desc", width: 45 },
    { header: "Uang Harian", key: "allowance", width: 16 },
    { header: "Status", key: "status", width: 12 },
  ];
  records
    .filter((r) => r.type === "Overtime")
    .forEach((r, i) => {
      wsOT.addRow({
        no: i + 1,
        date: format(parseISO(r.date), "dd MMM yyyy"),
        employee: r.submitter?.full_name ?? "",
        start: r.start_time?.slice(0, 5) ?? "",
        end: r.end_time?.slice(0, 5) ?? "",
        duration: r.duration_hours ?? 0,
        project: r.project?.project_code ?? "",
        desc: r.activity_description,
        allowance: r.daily_allowance ?? 0,
        status: r.status,
      });
    });

  const wsDK = wb.addWorksheet("Dinas Dalam Kota");
  wsDK.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Tanggal", key: "date", width: 14 },
    { header: "Nama Karyawan", key: "employee", width: 24 },
    { header: "Kode Proyek", key: "project", width: 16 },
    { header: "Uraian Kegiatan", key: "desc", width: 45 },
    { header: "Uang Harian", key: "allowance", width: 16 },
    { header: "Status", key: "status", width: 12 },
  ];
  records
    .filter((r) => r.type === "BusinessTrip_Local")
    .forEach((r, i) => {
      wsDK.addRow({
        no: i + 1,
        date: format(parseISO(r.date), "dd MMM yyyy"),
        employee: r.submitter?.full_name ?? "",
        project: r.project?.project_code ?? "",
        desc: r.activity_description,
        allowance: r.daily_allowance ?? 0,
        status: r.status,
      });
    });

  const wsLK = wb.addWorksheet("Dinas Luar Kota");
  wsLK.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Tanggal", key: "date", width: 14 },
    { header: "Nama Karyawan", key: "employee", width: 24 },
    { header: "Kode Proyek", key: "project", width: 16 },
    { header: "Uraian Kegiatan", key: "desc", width: 45 },
    { header: "Uang Harian", key: "allowance", width: 16 },
    { header: "Status", key: "status", width: 12 },
  ];
  records
    .filter((r) => r.type === "BusinessTrip_OutOfTown")
    .forEach((r, i) => {
      wsLK.addRow({
        no: i + 1,
        date: format(parseISO(r.date), "dd MMM yyyy"),
        employee: r.submitter?.full_name ?? "",
        project: r.project?.project_code ?? "",
        desc: r.activity_description,
        allowance: r.daily_allowance ?? 0,
        status: r.status,
      });
    });

  // Gross only. Tax, BPJS and other deductions belong to the payroll system
  // that reads this file.
  const wsPay = wb.addWorksheet("Rekap Gaji");
  wsPay.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Nama Karyawan", key: "employee", width: 24 },
    { header: "Jabatan", key: "title", width: 22 },
    { header: "Gaji Pokok", key: "base", width: 16 },
    { header: "Jam Lembur", key: "otHours", width: 13 },
    { header: "Uang Lembur", key: "otPay", width: 16 },
    { header: "Hari DDK", key: "dkDays", width: 11 },
    { header: "Uang DDK", key: "dkPay", width: 16 },
    { header: "Hari DLK", key: "lkDays", width: 11 },
    { header: "Uang DLK", key: "lkPay", width: 16 },
    { header: "Total Bruto", key: "gross", width: 18 },
  ];
  wsOT.getColumn("allowance").numFmt = "#,##0";
  wsDK.getColumn("allowance").numFmt = "#,##0";
  wsLK.getColumn("allowance").numFmt = "#,##0";
  for (const key of ["base", "otPay", "dkPay", "lkPay", "gross"]) {
    wsPay.getColumn(key).numFmt = "#,##0";
  }
  payrollRecap(records, rates, monthlyPeriod).forEach((line, i) => {
    wsPay.addRow({
      no: i + 1,
      employee: line.name,
      title: jobTitle(line.userId) ?? "",
      base: line.baseSalary,
      otHours: line.overtimeHours,
      otPay: line.overtimePay,
      dkDays: line.localTripDays,
      dkPay: line.localTripPay,
      lkDays: line.outOfTownDays,
      lkPay: line.outOfTownPay,
      gross: line.gross,
    });
  });

  const sheet = (ws: typeof wsOT, title: string, sub = subtitle) =>
    brandSheet(wb, ws, { company, title, subtitle: sub, logo });
  sheet(wsOT, "Rekap Lembur");
  sheet(wsDK, "Rekap Dinas Dalam Kota");
  sheet(wsLK, "Rekap Dinas Luar Kota");
  sheet(
    wsPay,
    "Rekap Gaji (Bruto)",
    `${subtitle}${monthlyPeriod ? "" : " · gaji pokok tidak dihitung, periode bukan satu bulan"}`,
  );

  await saveWorkbook(wb, fileName);
}

/** Daily rows in the order both exports print them. */
function sortedAttendance(
  records: AttendanceWithProfile[],
): AttendanceWithProfile[] {
  return [...records].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.profile?.full_name ?? "").localeCompare(b.profile?.full_name ?? ""),
  );
}

type AttendanceRecapRow = {
  name: string;
  title: string;
  counts: Record<AttendanceStatus, number>;
  hours: number;
};

/** Everyone gets a row, so an employee with no record at all still shows up
 *  as fully Alpa instead of quietly dropping out of payroll. */
function attendanceRecap(
  records: AttendanceWithProfile[],
  users: UserWithEmail[],
  /** Working days in the period, up to today. Alpa is derived from it. */
  workingDays: number,
): AttendanceRecapRow[] {
  const byUser = new Map<
    string,
    { name: string; title: string; rows: AttendanceWithProfile[] }
  >();
  users
    .filter((u) => !u.is_superadmin)
    .forEach((u) =>
      byUser.set(u.id, {
        name: u.full_name ?? "",
        title: u.employee_role_title ?? "",
        rows: [],
      }),
    );
  records.forEach((r) => {
    const entry = byUser.get(r.user_id) ?? {
      name: r.profile?.full_name ?? "",
      title: "",
      rows: [],
    };
    entry.rows.push(r);
    byUser.set(r.user_id, entry);
  });

  return [...byUser.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, title, rows }) => {
      const counts: Record<AttendanceStatus, number> = {
        Hadir: 0,
        Izin: 0,
        Sakit: 0,
        Cuti: 0,
        Alpa: 0,
      };
      rows.forEach((r) => counts[r.status]++);
      // A working day with no row at all is an unexcused absence.
      counts.Alpa += Math.max(0, workingDays - rows.length);
      return {
        name,
        title,
        counts,
        hours: Number(
          rows
            .reduce(
              (sum, r) => sum + (workHours(r.clock_in, r.clock_out) ?? 0),
              0,
            )
            .toFixed(1),
        ),
      };
    });
}

async function exportAttendanceExcel(
  records: AttendanceWithProfile[],
  users: UserWithEmail[],
  schedule: WorkSchedule | null | undefined,
  /** Working days in the period, up to today. Alpa is derived from it. */
  workingDays: number,
  title: string,
  fileName: string,
  company: string,
) {
  const { wb, logo } = await newWorkbook(company);

  const wsDay = wb.addWorksheet("Absensi");
  wsDay.columns = [
    { header: "Tanggal", key: "date", width: 14 },
    { header: "Nama Karyawan", key: "employee", width: 24 },
    { header: "Status", key: "status", width: 12 },
    { header: "Jam Masuk", key: "in", width: 12 },
    { header: "Jam Keluar", key: "out", width: 12 },
    { header: "Jam Kerja", key: "hours", width: 12 },
    { header: "Terlambat", key: "late", width: 12 },
    { header: "Pulang Cepat", key: "early", width: 14 },
    { header: "Catatan", key: "note", width: 40 },
  ];

  sortedAttendance(records).forEach((r) => {
    wsDay.addRow({
      date: format(parseISO(r.date), "dd MMM yyyy"),
      employee: r.profile?.full_name ?? "",
      status: r.status,
      in: r.clock_in?.slice(0, 5) ?? "",
      out: r.clock_out?.slice(0, 5) ?? "",
      hours: workHours(r.clock_in, r.clock_out) ?? "",
      late: isLateArrival(r.clock_in, schedule, r.status) ? "Ya" : "",
      early: isEarlyLeave(r.clock_out, schedule, r.status) ? "Ya" : "",
      note: r.note ?? "",
    });
  });

  const wsRecap = wb.addWorksheet("Rekap");
  wsRecap.columns = [
    { header: "Nama Karyawan", key: "employee", width: 24 },
    { header: "Jabatan", key: "title", width: 22 },
    { header: "Hari Kerja", key: "workdays", width: 12 },
    { header: "Hadir", key: "Hadir", width: 10 },
    { header: "Izin", key: "Izin", width: 10 },
    { header: "Sakit", key: "Sakit", width: 10 },
    { header: "Cuti", key: "Cuti", width: 10 },
    { header: "Alpa", key: "Alpa", width: 10 },
    { header: "Total Jam", key: "hours", width: 12 },
  ];

  attendanceRecap(records, users, workingDays).forEach(
    ({ name, title, counts, hours }) => {
      wsRecap.addRow({
        employee: name,
        title,
        workdays: workingDays,
        ...counts,
        hours,
      });
    },
  );

  brandSheet(wb, wsDay, {
    company,
    title: "Laporan Absensi Harian",
    subtitle: `${title} · ${records.length} data`,
    logo,
  });
  brandSheet(wb, wsRecap, {
    company,
    title: "Rekap Absensi per Karyawan",
    subtitle: `${title} · ${workingDays} hari kerja`,
    logo,
  });

  await saveWorkbook(wb, fileName);
}

async function exportAttendancePDF(
  records: AttendanceWithProfile[],
  users: UserWithEmail[],
  schedule: WorkSchedule | null | undefined,
  workingDays: number,
  title: string,
  fileName: string,
  company: string,
) {
  await exportPDF(
    company,
    "Laporan Absensi",
    `${title} · ${records.length} data · ${workingDays} hari kerja`,
    [
      {
        caption: "Absensi Harian",
        head: [
          "Tanggal",
          "Nama Karyawan",
          "Status",
          "Jam Masuk",
          "Jam Keluar",
          "Jam Kerja",
          "Terlambat",
          "Pulang Cepat",
        ],
        body: sortedAttendance(records).map((r) => {
          const hours = workHours(r.clock_in, r.clock_out);
          return [
            format(parseISO(r.date), "dd MMM yyyy"),
            r.profile?.full_name ?? "",
            r.status,
            r.clock_in?.slice(0, 5) ?? "",
            r.clock_out?.slice(0, 5) ?? "",
            hours === null ? "" : hours.toFixed(1),
            isLateArrival(r.clock_in, schedule, r.status) ? "Ya" : "",
            isEarlyLeave(r.clock_out, schedule, r.status) ? "Ya" : "",
          ];
        }),
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 60 },
          2: { cellWidth: 22 },
          3: { cellWidth: 24, halign: "center" },
          4: { cellWidth: 24, halign: "center" },
          5: { cellWidth: 24, halign: "center" },
          6: { cellWidth: 24, halign: "center" },
          7: { cellWidth: 28, halign: "center" },
        },
      },
      {
        caption: "Rekap per Karyawan",
        head: [
          "Nama Karyawan",
          "Jabatan",
          "Hari Kerja",
          "Hadir",
          "Izin",
          "Sakit",
          "Cuti",
          "Alpa",
          "Total Jam",
        ],
        body: attendanceRecap(records, users, workingDays).map(
          ({ name, title, counts, hours }) => [
            name,
            title,
            workingDays,
            counts.Hadir,
            counts.Izin,
            counts.Sakit,
            counts.Cuti,
            counts.Alpa,
            hours.toFixed(1),
          ],
        ),
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 44 },
          2: { cellWidth: 24, halign: "center" },
          3: { cellWidth: 20, halign: "center" },
          4: { cellWidth: 20, halign: "center" },
          5: { cellWidth: 20, halign: "center" },
          6: { cellWidth: 20, halign: "center" },
          7: { cellWidth: 20, halign: "center" },
          8: { cellWidth: 24, halign: "center" },
        },
      },
    ],
    fileName,
  );
}

function applyFilters(
  tasks: DailyTaskWithRelations[],
  dateFrom: string,
  dateTo: string,
  projectId: string,
  employeeId: string,
): DailyTaskWithRelations[] {
  return tasks.filter((t) => {
    // Dates are plain yyyy-MM-dd, so a string compare is already chronological.
    // An empty end only drops that one bound, and an inverted range (from later
    // than to) matches nothing instead of silently exporting everything.
    const inRange =
      (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo);
    const matchProj = projectId === "all" || t.project_id === Number(projectId);
    const matchEmp =
      employeeId === "all" || t.employee_id === Number(employeeId);
    return inRange && matchProj && matchEmp;
  });
}

// One button color per section (matches its icon), not per file format.
const BTN = {
  tasks: "bg-emerald-600 text-white hover:bg-emerald-700",
  overtime: "bg-amber-600 text-white hover:bg-amber-700",
  attendance: "bg-violet-600 text-white hover:bg-violet-700",
};

const SELECT_TRIGGER =
  "bg-secondary border-border text-foreground text-sm h-9";

/** One export type: icon header, description, then whatever the caller puts
 *  in (filters, preview, buttons). */
function ExportSection({
  icon: Icon,
  tint,
  title,
  subtitle,
  desc,
  tour,
  delay,
  children,
}: {
  icon: LucideIcon;
  tint: string;
  title: string;
  subtitle: string;
  desc?: string;
  tour?: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <motion.section
      data-tour={tour}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass-card rounded-xl p-5 flex flex-col gap-4"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            tint,
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {desc && (
        <p className="text-[11px] text-muted-foreground leading-relaxed -mt-1">
          {desc}
        </p>
      )}
      {children}
    </motion.section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}

function PreviewCount({
  count,
  loading,
  extra,
  tour,
}: {
  count: number;
  loading?: boolean;
  extra?: ReactNode;
  tour?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-tour={tour}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs bg-secondary/40 text-muted-foreground"
    >
      <span
        className={cn(
          "font-semibold text-sm",
          !loading && count > 0 && "text-foreground",
        )}
      >
        {loading ? "-" : count}
      </span>
      <span>
        {loading
          ? t("export.records.loading")
          : t("export.records.match", { count })}
      </span>
      {extra && <span className="ml-auto text-muted-foreground">{extra}</span>}
    </div>
  );
}

function ExportButton({
  status,
  onClick,
  disabled,
  colorCls,
  icon: Icon = Download,
  label,
}: {
  status: ExportStatus;
  onClick: () => void;
  disabled: boolean;
  colorCls: string;
  icon?: LucideIcon;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <Button
      onClick={onClick}
      disabled={status !== "idle" || disabled}
      className={cn("h-9 gap-2 w-full font-medium text-sm", colorCls)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={status}
          initial={{ opacity: 0, scale: status === "done" ? 0.9 : 1 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2"
        >
          {status === "generating" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : status === "done" ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : (
            <Icon className="w-3.5 h-3.5" />
          )}
          {status === "generating"
            ? t("export.status.generating")
            : status === "done"
              ? t("export.status.downloaded")
              : label}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

/** A file format inside the daily report section. */
function FormatOption({
  icon: Icon,
  tint,
  title,
  desc,
  children,
}: {
  icon: LucideIcon;
  tint: string;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4", tint)} />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
        {desc}
      </p>
      {children}
    </div>
  );
}

export default function ExportPage() {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();
  const { data: tasks = [], isLoading } = useDailyTasks();
  const { data: projects = [] } = useProjects();
  const { data: employees = [] } = useEmployees();
  const { data: overtimeRecords = [] } = useOvertimeRecords();
  const { data: employeeRates = [] } = useEmployeeRates();
  const jobTitles = useJobTitles();

  const today = format(new Date(), "yyyy-MM-dd");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(today);
  const [projectId, setProjectId] = useState("all");
  const [employeeId, setEmployeeId] = useState("all");
  const [excelStatus, setExcelStatus] = useState<ExportStatus>("idle");
  const [pdfStatus, setPdfStatus] = useState<ExportStatus>("idle");
  const [csvStatus, setCsvStatus] = useState<ExportStatus>("idle");
  const [overtimeStatus, setOvertimeStatus] = useState<ExportStatus>("idle");
  const [overtimeYear, setOvertimeYear] = useState(() =>
    new Date().getFullYear(),
  );
  const [overtimeMonth, setOvertimeMonth] = useState("all");
  // Payroll reads the overtime file, so only approved rows are in it by default.
  const [overtimeApproval, setOvertimeApproval] = useState("Approved");
  const [attendanceStatus, setAttendanceStatus] =
    useState<ExportStatus>("idle");
  const [attendancePdfStatus, setAttendancePdfStatus] =
    useState<ExportStatus>("idle");
  const [attPeriodType, setAttPeriodType] = useState<PeriodType>("monthly");
  const [attPeriodDate, setAttPeriodDate] = useState(() => new Date());

  const attRange = useMemo(
    () => periodRange(attPeriodType, attPeriodDate),
    [attPeriodType, attPeriodDate],
  );
  const { data: attendanceRecords = [], isLoading: attLoading } = useAttendance(
    format(attRange.start, "yyyy-MM-dd"),
    format(attRange.end, "yyyy-MM-dd"),
  );
  const { data: users = [] } = useUsers();
  const { data: holidays = [] } = useHolidays();
  const { data: schedule } = useWorkSchedule();
  const company = schedule?.company_name ?? "WorkDesk";
  const attWorkingDays = useMemo(
    () => countWorkdays(attRange.start, attRange.end, holidays, schedule),
    [attRange, holidays, schedule],
  );

  const filteredTasks = applyFilters(
    tasks,
    dateFrom,
    dateTo,
    projectId,
    employeeId,
  );

  const noTasks = isLoading || filteredTasks.length === 0;

  const overtimeYears = Array.from(
    new Set(overtimeRecords.map((r) => parseISO(r.date).getFullYear())),
  ).sort((a, b) => b - a);
  if (!overtimeYears.includes(overtimeYear))
    overtimeYears.unshift(overtimeYear);

  const filteredOvertimeRecords = overtimeRecords.filter((r) => {
    const d = parseISO(r.date);
    return (
      d.getFullYear() === overtimeYear &&
      (overtimeMonth === "all" || d.getMonth() === Number(overtimeMonth)) &&
      (overtimeApproval === "all" || r.status === overtimeApproval)
    );
  });

  const noAttendance = attLoading || attendanceRecords.length === 0;

  function buildTitle() {
    const proj =
      projectId !== "all"
        ? projects.find((p) => p.id === Number(projectId))?.project_code
        : null;
    const emp =
      employeeId !== "all"
        ? employees
            .find((e) => e.id === Number(employeeId))
            ?.full_name.split(" ")[0]
        : null;
    const parts = [TASKS_TITLE];
    // Either end can be open now, so neither side is formatted blindly.
    const from = dateFrom ? format(parseISO(dateFrom), "dd MMM yyyy") : "...";
    const to = dateTo ? format(parseISO(dateTo), "dd MMM yyyy") : "...";
    if (dateFrom || dateTo) parts.push(`${from}–${to}`);
    if (proj) parts.push(proj);
    if (emp) parts.push(emp);
    return parts.join(" · ");
  }

  async function handleExcelExport() {
    setExcelStatus("generating");
    try {
      await exportExcel(filteredTasks, buildTitle(), company);
      setExcelStatus("done");
      setTimeout(() => setExcelStatus("idle"), 3000);
    } catch {
      setExcelStatus("idle");
    }
  }

  async function handleCSVExport() {
    setCsvStatus("generating");
    try {
      await exportCSV(filteredTasks, buildTitle());
      setCsvStatus("done");
      setTimeout(() => setCsvStatus("idle"), 3000);
    } catch {
      setCsvStatus("idle");
    }
  }

  async function handlePDFExport() {
    setPdfStatus("generating");
    try {
      await exportTasksPDF(filteredTasks, buildTitle(), company);
      setPdfStatus("done");
      setTimeout(() => setPdfStatus("idle"), 3000);
    } catch {
      setPdfStatus("idle");
    }
  }

  async function handleOvertimeExport() {
    setOvertimeStatus("generating");
    const monthSuffix =
      overtimeMonth === "all"
        ? ""
        : `_${format(new Date(overtimeYear, Number(overtimeMonth)), "MMM")}`;
    const periodLabel =
      overtimeMonth === "all"
        ? String(overtimeYear)
        : format(new Date(overtimeYear, Number(overtimeMonth)), "MMMM yyyy");
    const approvalLabel =
      overtimeApproval === "all"
        ? t("export.overtimeStatus.all")
        : t(`overtime.status.${overtimeApproval}`);
    try {
      // The list the UI counted is the list that gets exported.
      await exportOvertimeExcel(
        filteredOvertimeRecords,
        employeeRates,
        `Lembur_DL_${overtimeYear}${monthSuffix}.xlsx`,
        `${periodLabel} · ${approvalLabel}`,
        overtimeMonth !== "all",
        company,
        jobTitles.byUser,
      );
      setOvertimeStatus("done");
      setTimeout(() => setOvertimeStatus("idle"), 3000);
    } catch {
      setOvertimeStatus("idle");
    }
  }

  /** Title and file name the attendance exports share, both built from the
   *  period the card is showing. */
  function attendanceLabels() {
    const from = format(attRange.start, "yyyy-MM-dd");
    const to = format(attRange.end, "yyyy-MM-dd");
    return {
      title: `Periode ${format(attRange.start, "dd MMM yyyy")} - ${format(attRange.end, "dd MMM yyyy")}`,
      fileBase: `Absensi_${from}_${to}`,
    };
  }

  async function handleAttendanceExport() {
    setAttendanceStatus("generating");
    const { title, fileBase } = attendanceLabels();
    try {
      await exportAttendanceExcel(
        attendanceRecords,
        users,
        schedule,
        attWorkingDays,
        title,
        `${fileBase}.xlsx`,
        company,
      );
      setAttendanceStatus("done");
      setTimeout(() => setAttendanceStatus("idle"), 3000);
    } catch {
      setAttendanceStatus("idle");
    }
  }

  async function handleAttendancePDFExport() {
    setAttendancePdfStatus("generating");
    const { title, fileBase } = attendanceLabels();
    try {
      await exportAttendancePDF(
        attendanceRecords,
        users,
        schedule,
        attWorkingDays,
        title,
        `${fileBase}.pdf`,
        company,
      );
      setAttendancePdfStatus("done");
      setTimeout(() => setAttendancePdfStatus("idle"), 3000);
    } catch {
      setAttendancePdfStatus("idle");
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6 w-full">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="text-lg font-bold text-foreground tracking-tight">
          {t("export.title")}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("export.subtitle")}
        </p>
      </motion.div>

      <ExportSection
        icon={FileText}
        tint="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        title={t("export.tasks.title")}
        subtitle={t("export.tasks.subtitle")}
        delay={0.06}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div data-tour="export-daterange" className="grid grid-cols-2 gap-3">
            <DatePickerField
              label={t("export.filters.dateFrom")}
              value={dateFrom || null}
              onChange={(v) => {
                setDateFrom(v ?? "");
                if (v && dateTo && dateTo < v) setDateTo("");
              }}
            />
            <DatePickerField
              label={t("export.filters.dateTo")}
              value={dateTo || null}
              onChange={(v) => setDateTo(v ?? "")}
              fromDate={dateFrom || null}
            />
          </div>
          <div data-tour="export-fields" className="grid grid-cols-2 gap-3">
            <Field label={t("export.filters.project")}>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className={SELECT_TRIGGER}>
                  <SelectValue placeholder={t("export.filters.allProjects")} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all" className="text-sm">
                    {t("export.filters.allProjects")}
                  </SelectItem>
                  {projects.map((p) => (
                    <SelectItem
                      key={p.id}
                      value={p.id.toString()}
                      className="text-sm"
                    >
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 text-xs">
                        {p.project_code}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {p.project_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("export.filters.employee")}>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className={SELECT_TRIGGER}>
                  <SelectValue placeholder={t("export.filters.allEmployees")} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all" className="text-sm">
                    {t("export.filters.allEmployees")}
                  </SelectItem>
                  {employees.map((e) => (
                    <SelectItem
                      key={e.id}
                      value={e.id.toString()}
                      className="text-sm"
                    >
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <PreviewCount
          tour="export-preview"
          count={filteredTasks.length}
          loading={isLoading}
        />

        <div
          data-tour="export-buttons"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <FormatOption
            icon={Sheet}
            tint="text-emerald-600 dark:text-emerald-400"
            title={t("export.excel.title")}
            desc={t("export.excel.desc")}
          >
            <ExportButton
              status={excelStatus}
              onClick={handleExcelExport}
              colorCls={BTN.tasks}
              disabled={noTasks}
              label={t("export.excel.button")}
            />
          </FormatOption>
          <FormatOption
            icon={Table}
            tint="text-sky-600 dark:text-sky-400"
            title={t("export.csv.title")}
            desc={t("export.csv.desc")}
          >
            <ExportButton
              status={csvStatus}
              onClick={handleCSVExport}
              colorCls={BTN.tasks}
              disabled={noTasks}
              label={t("export.csv.button")}
            />
          </FormatOption>
          <FormatOption
            icon={FileText}
            tint="text-rose-600 dark:text-rose-400"
            title={t("export.pdf.title")}
            desc={t("export.pdf.desc")}
          >
            <ExportButton
              status={pdfStatus}
              onClick={handlePDFExport}
              colorCls={BTN.tasks}
              disabled={noTasks}
              label={t("export.pdf.button")}
            />
          </FormatOption>
        </div>

        <div className="text-[11px] text-muted-foreground space-y-1">
          <p>· {t("export.tips.emptyDates")}</p>
          <p>· {t("export.tips.currentData")}</p>
        </div>
      </ExportSection>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 items-stretch">
        <ExportSection
          tour="export-overtime"
          icon={Clock}
          tint="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        title={t("overtime.export.title")}
          subtitle={t("overtime.export.subtitle")}
          desc={t("overtime.export.desc")}
          delay={0.12}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label={t("overtime.export.yearFilter")}>
              <Select
                value={String(overtimeYear)}
                onValueChange={(v) => setOvertimeYear(Number(v))}
              >
                <SelectTrigger className={SELECT_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {overtimeYears.map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-sm">
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("overtime.export.monthFilter")}>
              <Select value={overtimeMonth} onValueChange={setOvertimeMonth}>
                <SelectTrigger className={SELECT_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all" className="text-sm">
                    {t("overtime.export.allMonths")}
                  </SelectItem>
                  {Array.from({ length: 12 }).map((_, m) => (
                    <SelectItem key={m} value={String(m)} className="text-sm">
                      {format(new Date(overtimeYear, m), "MMMM", { locale })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("export.overtimeStatus.label")}>
              <Select
                value={overtimeApproval}
                onValueChange={setOvertimeApproval}
              >
                <SelectTrigger className={SELECT_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all" className="text-sm">
                    {t("export.overtimeStatus.all")}
                  </SelectItem>
                  {["Approved", "Pending", "Rejected"].map((s) => (
                    <SelectItem key={s} value={s} className="text-sm">
                      {t(`overtime.status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <PreviewCount count={filteredOvertimeRecords.length} />

          <div className="mt-auto">
            <ExportButton
              status={overtimeStatus}
              onClick={handleOvertimeExport}
              colorCls={BTN.overtime}
              disabled={filteredOvertimeRecords.length === 0}
              label={t("overtime.export.button")}
            />
          </div>
        </ExportSection>

        <ExportSection
          tour="export-attendance"
          icon={CalendarCheck}
          tint="bg-violet-500/10 text-violet-600 dark:text-violet-400"
        title={t("export.attendance.title")}
          subtitle={t("export.attendance.subtitle")}
          desc={t("export.attendance.desc")}
          delay={0.18}
        >
          <Field label={t("export.attendance.period")}>
            <AttendancePeriodFilter
              periodType={attPeriodType}
              onPeriodTypeChange={setAttPeriodType}
              date={attPeriodDate}
              onDateChange={setAttPeriodDate}
            />
          </Field>

          <PreviewCount
            count={attendanceRecords.length}
            loading={attLoading}
            extra={t("export.attendance.workingDays", {
              count: attWorkingDays,
            })}
          />

          <div className="mt-auto grid grid-cols-2 gap-2">
            <ExportButton
              status={attendanceStatus}
              onClick={handleAttendanceExport}
              colorCls={BTN.attendance}
              disabled={noAttendance}
              label={t("export.attendance.button")}
            />
            <ExportButton
              status={attendancePdfStatus}
              onClick={handleAttendancePDFExport}
              colorCls={BTN.attendance}
              disabled={noAttendance}
              icon={FileText}
              label={t("export.attendance.pdfButton")}
            />
          </div>
        </ExportSection>
      </div>
    </div>
  );
}
