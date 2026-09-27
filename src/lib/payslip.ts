import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import type { PayrollLineWithName } from "@/lib/types";
import {
  HEAD_FILL,
  INK,
  PDF_MARGIN,
  PDF_TOP,
  brandPdfPages,
  pdfTableStyle,
  registerPdfFont,
} from "@/lib/exportBrand";

const money = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const DIGITS = [
  "", "satu", "dua", "tiga", "empat", "lima",
  "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas",
];

function spell(n: number): string {
  if (n < 12) return DIGITS[n];
  if (n < 20) return `${spell(n - 10)} belas`;
  if (n < 100) return `${spell(Math.floor(n / 10))} puluh ${spell(n % 10)}`;
  if (n < 200) return `seratus ${spell(n - 100)}`;
  if (n < 1000) return `${spell(Math.floor(n / 100))} ratus ${spell(n % 100)}`;
  if (n < 2000) return `seribu ${spell(n - 1000)}`;
  if (n < 1e6) return `${spell(Math.floor(n / 1000))} ribu ${spell(n % 1000)}`;
  if (n < 1e9) return `${spell(Math.floor(n / 1e6))} juta ${spell(n % 1e6)}`;
  if (n < 1e12) return `${spell(Math.floor(n / 1e9))} miliar ${spell(n % 1e9)}`;
  return `${spell(Math.floor(n / 1e12))} triliun ${spell(n % 1e12)}`;
}

/** Amount in Indonesian words, e.g. 2500000 → "Dua Juta Lima Ratus Ribu Rupiah". */
export function terbilang(amount: number): string {
  const n = Math.round(Math.abs(amount));
  const words = n === 0 ? "nol" : spell(n);
  const text = `${amount < 0 ? "minus " : ""}${words} rupiah`
    .replace(/\s+/g, " ")
    .trim();
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

type JsPDF = InstanceType<typeof import("jspdf").jsPDF>;
type AutoTable = typeof import("jspdf-autotable").default;

/** One page per employee, A4 portrait, same letterhead as the other exports.
 *  Several lines land in one PDF, one page each. */
export async function downloadPayslips(
  lines: PayrollLineWithName[],
  /** First day of the month the run covers. */
  period: string,
  companyName: string,
) {
  if (lines.length === 0) return;
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const font = await registerPdfFont(doc);
  const periodLabel = format(parseISO(period), "MMMM yyyy", { locale: localeId });
  lines.forEach((line, i) => {
    if (i > 0) doc.addPage();
    renderSlip(doc, autoTable, font, line);
  });
  await brandPdfPages(doc, {
    company: companyName,
    title: "Slip Gaji Karyawan",
    subtitle: `Periode: ${periodLabel}`,
    font,
  });

  const who =
    lines.length === 1 ? lines[0].name.replace(/\s+/g, "_") : "Semua";
  doc.save(`Slip_Gaji_${who}_${format(parseISO(period), "yyyy_MM")}.pdf`);
}

function renderSlip(
  doc: JsPDF,
  autoTable: AutoTable,
  font: string,
  line: PayrollLineWithName,
) {
  const { width } = doc.internal.pageSize;
  const m = PDF_MARGIN;
  const inner = width - m * 2;
  const day = (d: string | Date) =>
    format(typeof d === "string" ? parseISO(d) : d, "d MMMM yyyy", {
      locale: localeId,
    });

  doc.setTextColor(...INK);
  let y = PDF_TOP + 2;
  doc.setFont(font, "bold");
  doc.setFontSize(10);
  doc.text("DATA KARYAWAN", m, y);
  y += 6;
  const paid = line.payment_status === "Paid";
  const info: [string, string][] = [
    ["Nama", line.name],
    ["Jabatan", line.job_title || "-"],
    ["Status Pembayaran", paid ? "Sudah dibayar" : "Belum dibayar"],
    ["Tanggal Pembayaran", paid && line.paid_at ? day(line.paid_at) : "-"],
  ];
  doc.setFont(font, "normal");
  doc.setFontSize(9.5);
  info.forEach(([label, value]) => {
    doc.text(label, m, y);
    doc.text(`:  ${value}`, m + 40, y);
    y += 5.5;
  });
  y += 3;

  const earnings: [string, number][] = [
    ["Gaji Pokok", line.base_salary],
    [`Lembur (${line.overtime_hours} jam)`, line.overtime_pay],
    [`Dinas Dalam Kota (${line.local_trip_days} hari)`, line.local_trip_pay],
    [`Dinas Luar Kota (${line.out_of_town_days} hari)`, line.out_of_town_pay],
  ];
  const deductions = (
    [
      ["PPh 21", line.pph21],
      ["BPJS", line.bpjs],
      ["Potongan Lain", line.other_deduction],
    ] as [string, number][]
  ).filter(([, amount]) => amount > 0);
  const totalDeduction = deductions.reduce((sum, [, a]) => sum + a, 0);

  const rows = Math.max(earnings.length, deductions.length);
  const body = Array.from({ length: rows }, (_, i) => {
    const e = earnings[i];
    const d = deductions[i];
    return [
      e?.[0] ?? "",
      e ? money(e[1]) : "",
      d?.[0] ?? (i === 0 ? "Tidak ada potongan" : ""),
      d ? money(d[1]) : "",
    ];
  });
  const amountW = 32;
  const labelW = inner / 2 - amountW;
  autoTable(doc, {
    ...pdfTableStyle(font),
    startY: y,
    head: [
      [
        { content: "PENGHASILAN (A)", colSpan: 2 },
        { content: "POTONGAN (B)", colSpan: 2 },
      ],
    ],
    body,
    foot: [["Total (A)", money(line.gross), "Total (B)", money(totalDeduction)]],
    styles: { ...pdfTableStyle(font).styles, fontSize: 9, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: labelW },
      1: { cellWidth: amountW, halign: "right" },
      2: { cellWidth: labelW },
      3: { cellWidth: amountW, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "foot" && data.column.index % 2 === 1)
        data.cell.styles.halign = "right";
    },
    margin: { left: m, right: m },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY + 6;

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.setFillColor(...HEAD_FILL);
  doc.rect(m, y, inner, 16, "FD");
  doc.setFont(font, "bold");
  doc.setFontSize(10.5);
  doc.text(
    `TOTAL GAJI BERSIH (TAKE HOME PAY) = ${money(line.net)}`,
    width / 2,
    y + 6.5,
    { align: "center" },
  );
  doc.setFont(font, "normal");
  doc.setFontSize(8.5);
  doc.text(`(Terbilang: ${terbilang(line.net)})`, width / 2, y + 12, {
    align: "center",
    maxWidth: inner - 8,
  });
  y += 22;

  if (line.deduction_note) {
    doc.setFontSize(8.5);
    doc.text(`Catatan: ${line.deduction_note}`, m, y, { maxWidth: inner });
    y += 8;
  }

  y += 4;
  const left = m + 30;
  const right = width - m - 30;
  doc.setFontSize(9.5);
  doc.text(day(new Date()), right, y, { align: "center" });
  y += 6;
  doc.text("Bagian Keuangan,", left, y, { align: "center" });
  doc.text("Penerima,", right, y, { align: "center" });
  y += 24;
  doc.text("( ............................ )", left, y, { align: "center" });
  doc.text(`( ${line.name} )`, right, y, { align: "center" });

  y += 12;
  doc.setFontSize(8);
  doc.text(
    "Slip gaji ini bersifat rahasia. Jika terdapat ketidaksesuaian, segera hubungi bagian HRD.",
    m,
    y,
    { maxWidth: inner },
  );
}
