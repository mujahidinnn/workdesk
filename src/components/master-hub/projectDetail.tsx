import { format } from "date-fns";
import type { DetailField } from "@/components/ui/DetailDialog";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export function isOverdue(project: Project): boolean {
  if (!project.end_date) return false;
  const statusName = project.work_status?.status_name;
  if (statusName === "Done" || statusName === "Cancel") return false;
  return new Date(project.end_date) < new Date(new Date().toDateString());
}

export const priorityConfig: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  Low: {
    label: "Low",
    cls: "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700/40",
    dot: "bg-zinc-500 dark:bg-zinc-400",
  },
  Medium: {
    label: "Medium",
    cls: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800/40",
    dot: "bg-blue-500 dark:bg-blue-400",
  },
  High: {
    label: "High",
    cls: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800/40",
    dot: "bg-rose-500 dark:bg-rose-400",
  },
};

export const statusColors: Record<string, string> = {
  MOU: "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-800/40",
  Requirement:
    "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800/40",
  Cancel:
    "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-800/40",
  "Client Review":
    "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800/40",
  Quotation:
    "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-400 dark:border-cyan-800/40",
  Done: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800/40",
  Development:
    "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-400 dark:border-indigo-800/40",
};

export function projectDetailFields(p: Project, t: (k: string) => string): DetailField[] {
  const prio = priorityConfig[p.priority ?? "Medium"] ?? priorityConfig.Medium;
  const statusName = p.work_status?.status_name;
  const fmt = (d?: string | null) => d && format(new Date(d), "dd MMM yyyy");
  return [
    { label: t("master.projects.columns.code"), value: p.project_code },
    { label: t("master.projects.columns.name"), value: p.project_name },
    { label: t("master.projects.columns.client"), value: p.client },
    {
      label: t("master.projects.columns.status"),
      value: statusName && (
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border",
            statusColors[statusName] ??
              "bg-secondary text-muted-foreground border-border",
          )}
        >
          {statusName}
        </span>
      ),
    },
    {
      label: t("master.projects.columns.type"),
      value: (p.project_types ?? []).map((tp) => tp.type_name).join(", "),
    },
    {
      label: t("master.projects.columns.priority"),
      value: (
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
            prio.cls,
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", prio.dot)} />
          {prio.label}
        </span>
      ),
    },
    { label: t("master.projects.fields.picName"), value: p.pic_name },
    { label: t("master.projects.fields.picContact"), value: p.pic_contact },
    { label: t("master.projects.fields.startDate"), value: fmt(p.start_date) },
    {
      label: t("master.projects.fields.endDate"),
      value: p.end_date && (
        <span
          className={cn(
            isOverdue(p) && "text-rose-600 font-semibold dark:text-rose-400",
          )}
        >
          {fmt(p.end_date)}
        </span>
      ),
    },
  ];
}
