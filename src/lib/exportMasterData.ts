import { format, parseISO } from "date-fns";
import type { Project, Employee } from "@/lib/types";
import { brandSheet, newWorkbook, saveWorkbook } from "@/lib/exportBrand";

export async function exportProjectsExcel(
  projects: Project[],
  company: string,
) {
  const { wb, logo } = await newWorkbook(company);
  const ws = wb.addWorksheet("Projects");
  ws.columns = [
    { header: "Code", key: "code", width: 18 },
    { header: "Name", key: "name", width: 32 },
    { header: "Client", key: "client", width: 22 },
    { header: "Status", key: "status", width: 16 },
    { header: "Types", key: "types", width: 24 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "PIC", key: "pic", width: 20 },
    { header: "Start", key: "start", width: 14 },
    { header: "End", key: "end", width: 14 },
  ];
  projects.forEach((p) => {
    ws.addRow({
      code: p.project_code,
      name: p.project_name,
      client: p.client,
      status: p.work_status?.status_name ?? "",
      types: (p.project_types ?? []).map((t) => t.type_name).join(", "),
      priority: p.priority ?? "",
      pic: p.pic_name ?? "",
      start: p.start_date ? format(new Date(p.start_date), "dd MMM yyyy") : "",
      end: p.end_date ? format(new Date(p.end_date), "dd MMM yyyy") : "",
    });
  });

  brandSheet(wb, ws, {
    company,
    title: "Daftar Proyek",
    subtitle: `${projects.length} proyek`,
    logo,
  });
  await saveWorkbook(wb, `Projects_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}

export async function exportEmployeesExcel(
  employees: Employee[],
  company: string,
) {
  const { wb, logo } = await newWorkbook(company);
  const ws = wb.addWorksheet("Employees");
  ws.columns = [
    { header: "Employee No", key: "number", width: 14 },
    { header: "Name", key: "name", width: 28 },
    { header: "Role", key: "role", width: 24 },
    { header: "Department", key: "department", width: 20 },
    { header: "Employment", key: "employment", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Join Date", key: "joinDate", width: 14 },
    { header: "Resign Date", key: "resignDate", width: 14 },
    { header: "Leave Quota", key: "quota", width: 12 },
    { header: "Created", key: "joined", width: 16 },
  ];
  employees.forEach((e) => {
    ws.addRow({
      number: e.employee_number ?? "-",
      name: e.full_name,
      role: e.role_title,
      department: e.department ?? "-",
      employment: e.employment_type,
      status: e.status,
      joinDate: e.join_date
        ? format(parseISO(e.join_date), "dd MMM yyyy")
        : "-",
      resignDate: e.resign_date
        ? format(parseISO(e.resign_date), "dd MMM yyyy")
        : "-",
      quota: e.annual_leave_quota,
      joined: format(new Date(e.created_at), "dd MMM yyyy"),
    });
  });

  brandSheet(wb, ws, {
    company,
    title: "Daftar Karyawan",
    subtitle: `${employees.length} karyawan`,
    logo,
  });
  await saveWorkbook(wb, `Employees_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}
