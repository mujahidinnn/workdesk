import type { ProjectType, WorkStatus } from "@/lib/types";
import type { ProjectPayload } from "@/hooks/useProjects";

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResult<T> {
  valid: T[];
  errors: ImportRowError[];
}

async function readRows(file: File): Promise<unknown[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: unknown[][] = [];
  ws.eachRow((row) => {
    rows.push((row.values as unknown[]).slice(1));
  });
  return rows;
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "text" in (v as object)) {
    return String((v as { text: unknown }).text ?? "").trim();
  }
  return String(v).trim();
}

export async function parseProjectsExcel(
  file: File,
  workStatuses: WorkStatus[],
  projectTypes: ProjectType[],
): Promise<ImportResult<ProjectPayload>> {
  const rows = await readRows(file);
  const valid: ProjectPayload[] = [];
  const errors: ImportRowError[] = [];

  rows.slice(1).forEach((cells, i) => {
    const rowNum = i + 2;
    const [code, name, client, statusName, typesText, priority, pic] = cells;
    const project_code = cellText(code);
    const project_name = cellText(name);
    const clientText = cellText(client);

    if (!project_code || !project_name || !clientText) {
      errors.push({
        row: rowNum,
        message: "Code, Name, and Client are required",
      });
      return;
    }

    const status = workStatuses.find(
      (s) => s.status_name.toLowerCase() === cellText(statusName).toLowerCase(),
    );
    const typeIds = cellText(typesText)
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .map(
        (t) => projectTypes.find((pt) => pt.type_name.toLowerCase() === t)?.id,
      )
      .filter((id): id is number => id != null);

    valid.push({
      project_code,
      project_name,
      client: clientText,
      priority: cellText(priority) || "Medium",
      pic_name: cellText(pic) || undefined,
      status_id: status?.id ?? null,
      project_type_ids: typeIds,
      member_user_ids: [],
    });
  });

  return { valid, errors };
}

export interface EmployeeImportRow {
  full_name: string;
  role_title: string;
  status: "Active" | "Inactive";
}

export async function parseEmployeesExcel(
  file: File,
): Promise<ImportResult<EmployeeImportRow>> {
  const rows = await readRows(file);
  const valid: EmployeeImportRow[] = [];
  const errors: ImportRowError[] = [];

  rows.slice(1).forEach((cells, i) => {
    const rowNum = i + 2;
    const [name, role, status] = cells;
    const full_name = cellText(name);
    const role_title = cellText(role);

    if (!full_name || !role_title) {
      errors.push({ row: rowNum, message: "Name and Role are required" });
      return;
    }

    valid.push({
      full_name,
      role_title,
      status:
        cellText(status).toLowerCase() === "inactive" ? "Inactive" : "Active",
    });
  });

  return { valid, errors };
}
