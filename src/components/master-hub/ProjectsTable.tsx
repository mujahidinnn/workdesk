import { useState } from "react";
import { motion } from "framer-motion";
import {
  Pencil,
  Trash2,
  FolderKanban,
  User,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AccessControl } from "@/components/auth/AccessControl";
import { SortableTh } from "@/components/ui/SortableTh";
import { Pager } from "@/components/ui/Pager";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import { useSortableData } from "@/hooks/useSortableData";
import { usePagination } from "@/hooks/usePagination";
import { PROJECT_BADGE_COLORS as codeBadgeColors } from "@/lib/colorPalettes";
import { format } from "date-fns";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey =
  "project_code" | "project_name" | "client" | "priority" | "start_date";

function isOverdue(project: Project): boolean {
  if (!project.end_date) return false;
  const statusName = project.work_status?.status_name;
  if (statusName === "Done" || statusName === "Cancel") return false;
  return new Date(project.end_date) < new Date(new Date().toDateString());
}

const priorityConfig: Record<
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

const statusColors: Record<string, string> = {
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

interface ProjectsTableProps {
  projects: Project[];
  onEdit: (p: Project) => void;
  onDelete: (id: number) => void;
  isLoading?: boolean;
  isFiltered?: boolean;
}

export function ProjectsTable({
  projects,
  onEdit,
  onDelete,
  isLoading,
  isFiltered,
}: ProjectsTableProps) {
  const { t } = useTranslation();
  const { sorted, sortKey, direction, toggleSort } = useSortableData<
    Project,
    SortKey
  >(projects, (p, key) => p[key] ?? "");
  const { paged, page, setPage, pageCount, pageSize, total } =
    usePagination(sorted);
  const [viewing, setViewing] = useState<Project | null>(null);

  return (
    <>
    <div className="flex flex-col gap-4">

      <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <SortableTh
                active={sortKey === "project_code"}
                direction={direction}
                onClick={() => toggleSort("project_code")}
              >
                {t("master.projects.columns.code")}
              </SortableTh>
              <SortableTh
                active={sortKey === "project_name"}
                direction={direction}
                onClick={() => toggleSort("project_name")}
              >
                {t("master.projects.columns.name")}
              </SortableTh>
              <SortableTh
                active={sortKey === "client"}
                direction={direction}
                onClick={() => toggleSort("client")}
              >
                {t("master.projects.columns.client")}
              </SortableTh>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                {t("master.projects.columns.status")}
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                {t("master.projects.columns.type")}
              </th>
              <SortableTh
                active={sortKey === "priority"}
                direction={direction}
                onClick={() => toggleSort("priority")}
              >
                {t("master.projects.columns.priority")}
              </SortableTh>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                {t("master.projects.columns.pic")}
              </th>
              <SortableTh
                active={sortKey === "start_date"}
                direction={direction}
                onClick={() => toggleSort("start_date")}
              >
                {t("master.projects.columns.period")}
              </SortableTh>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-secondary animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4">
                  <EmptyState
                    icon={FolderKanban}
                    title={
                      isFiltered
                        ? t("master.projects.noResults")
                        : t("master.projects.empty")
                    }
                  />
                </td>
              </tr>
            ) : (
              paged.map((project, i) => {
                const prio =
                  priorityConfig[project.priority ?? "Medium"] ??
                  priorityConfig.Medium;
                const statusName = project.work_status?.status_name;
                const statusCls = statusName
                  ? (statusColors[statusName] ??
                    "bg-secondary text-muted-foreground border-border")
                  : null;
                const overdue = isOverdue(project);
                return (
                  <motion.tr
                    key={project.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    {...detailRowProps(() => setViewing(project))}
                    className="border-b border-border/40 group hover:bg-secondary/40 transition-colors cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border",
                          codeBadgeColors[i % codeBadgeColors.length],
                        )}
                      >
                        {project.project_code}
                      </span>
                    </td>

                    <td className="px-4 py-3 max-w-[180px]">
                      <p className="text-sm font-medium text-foreground truncate">
                        {project.project_name}
                      </p>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-muted-foreground">
                        {project.client}
                      </p>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {statusCls && statusName ? (
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                            statusCls,
                          )}
                        >
                          {statusName}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">
                          -
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(project.project_types ?? []).length === 0 ? (
                          <span className="text-[10px] text-muted-foreground/40">
                            -
                          </span>
                        ) : (
                          (project.project_types ?? []).map((tp) => (
                            <span
                              key={tp.id}
                              className="inline-flex items-center px-1.5 py-0.5 rounded border border-border text-[10px] text-muted-foreground"
                            >
                              {tp.type_name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                          prio.cls,
                        )}
                      >
                        <span
                          className={cn("w-1.5 h-1.5 rounded-full", prio.dot)}
                        />
                        {prio.label}
                      </span>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {project.pic_name ? (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-foreground leading-none">
                              {project.pic_name}
                            </p>
                            {project.pic_contact && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {project.pic_contact}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">
                          -
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {project.start_date || project.end_date ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar
                            className={cn(
                              "w-3 h-3 flex-shrink-0",
                              overdue
                                ? "text-rose-500"
                                : "text-muted-foreground",
                            )}
                          />
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            {project.start_date
                              ? format(
                                  new Date(project.start_date),
                                  "dd MMM yy",
                                )
                              : "-"}
                            {" → "}
                            <span
                              className={cn(
                                overdue &&
                                  "text-rose-600 font-semibold dark:text-rose-400 dark:drop-shadow-[0_0_6px_hsl(356_80%_52%/0.6)]",
                              )}
                            >
                              {project.end_date
                                ? format(
                                    new Date(project.end_date),
                                    "dd MMM yy",
                                  )
                                : "-"}
                            </span>
                          </p>
                          {overdue && (
                            <AlertCircle className="w-3 h-3 text-rose-500 flex-shrink-0" />
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">
                          -
                        </span>
                      )}
                    </td>

                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                        <AccessControl feature="master" action="update">
                          <button
                            onClick={() => onEdit(project)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </AccessControl>
                        <AccessControl feature="master" action="delete">
                          <button
                            onClick={() => onDelete(project.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </AccessControl>
                      </div>
                    </td>
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pager
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
    <DetailDialog
      title={t("common.detail")}
      fields={viewing && detailFields(viewing, t)}
      onClose={() => setViewing(null)}
    />
    </>
  );
}

function detailFields(p: Project, t: (k: string) => string): DetailField[] {
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
