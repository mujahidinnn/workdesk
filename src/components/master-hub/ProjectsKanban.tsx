import { motion } from "framer-motion";
import {
  AlertCircle,
  Pencil,
  Trash2,
  Calendar,
  FolderKanban,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/EmptyState";
import { format } from "date-fns";
import type { Project } from "@/lib/types";
import { PROJECT_BADGE_COLORS } from "@/lib/colorPalettes";
import { cn } from "@/lib/utils";

const COLUMN_ORDER = [
  "Requirement",
  "Development",
  "Client Review",
  "Quotation",
  "MOU",
  "Done",
  "Cancel",
];

const columnConfig: Record<
  string,
  { dot: string; border: string; header: string }
> = {
  Requirement: {
    dot: "bg-purple-500 dark:bg-purple-400",
    border: "border-purple-200 dark:border-purple-900/40",
    header: "text-purple-700 dark:text-purple-400",
  },
  Development: {
    dot: "bg-indigo-500 dark:bg-indigo-400",
    border: "border-indigo-200 dark:border-indigo-900/40",
    header: "text-indigo-700 dark:text-indigo-400",
  },
  "Client Review": {
    dot: "bg-amber-500 dark:bg-amber-400",
    border: "border-amber-200 dark:border-amber-900/40",
    header: "text-amber-700 dark:text-amber-400",
  },
  Quotation: {
    dot: "bg-cyan-500 dark:bg-cyan-400",
    border: "border-cyan-200 dark:border-cyan-900/40",
    header: "text-cyan-700 dark:text-cyan-400",
  },
  MOU: {
    dot: "bg-sky-500 dark:bg-sky-400",
    border: "border-sky-200 dark:border-sky-900/40",
    header: "text-sky-700 dark:text-sky-400",
  },
  Done: {
    dot: "bg-emerald-500 dark:bg-emerald-400",
    border: "border-emerald-200 dark:border-emerald-900/40",
    header: "text-emerald-700 dark:text-emerald-400",
  },
  Cancel: {
    dot: "bg-red-500 dark:bg-red-400",
    border: "border-red-200 dark:border-red-900/40",
    header: "text-red-700 dark:text-red-400",
  },
  Unassigned: {
    dot: "bg-zinc-500",
    border: "border-zinc-300 dark:border-zinc-700/40",
    header: "text-zinc-600 dark:text-zinc-400",
  },
};

const priorityDot: Record<string, string> = {
  High: "bg-rose-500 dark:bg-rose-400",
  Medium: "bg-blue-500 dark:bg-blue-400",
  Low: "bg-zinc-500",
};

const codeBadgeColors = PROJECT_BADGE_COLORS;

function isOverdue(project: Project): boolean {
  if (!project.end_date) return false;
  const statusName = project.work_status?.status_name;
  if (statusName === "Done" || statusName === "Cancel") return false;
  return new Date(project.end_date) < new Date(new Date().toDateString());
}

interface KanbanCardProps {
  project: Project;
  globalIndex: number;
  cardIndex: number;
  avgProgress: number;
  onEdit: (p: Project) => void;
  onDelete: (id: number) => void;
}

function KanbanCard({
  project,
  globalIndex,
  cardIndex,
  avgProgress,
  onEdit,
  onDelete,
}: KanbanCardProps) {
  const overdue = isOverdue(project);
  const pDot = priorityDot[project.priority ?? "Low"] ?? priorityDot.Low;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        delay: cardIndex * 0.04,
        layout: { type: "spring", stiffness: 400, damping: 30 },
      }}
      className={cn(
        "group glass-card rounded-xl p-3.5 flex flex-col gap-2.5 border transition-all hover:border-border",
        overdue
          ? "border-rose-300 dark:border-rose-800/40"
          : "border-border/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border",
              codeBadgeColors[globalIndex % codeBadgeColors.length],
            )}
          >
            {project.project_code.split("-").slice(0, 2).join("-")}
          </span>
          {overdue && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-900/40">
              <AlertCircle className="w-2.5 h-2.5" />
              Overdue
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => onEdit(project)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete(project.id)}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2">
          {project.project_name}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {project.client}
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground">Progress</span>
          <span className="text-[9px] font-semibold text-foreground">
            {avgProgress}%
          </span>
        </div>
        <div className="h-1 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className={cn(
              "h-full rounded-full",
              avgProgress === 100
                ? "bg-emerald-500"
                : avgProgress >= 70
                  ? "bg-blue-500"
                  : "bg-amber-500",
            )}
            initial={{ width: 0 }}
            animate={{ width: `${avgProgress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-1">
          <span
            className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", pDot)}
          />
          <span className="text-[9px] text-muted-foreground">
            {project.priority ?? "Low"}
          </span>
        </div>
        {(project.start_date || project.end_date) && (
          <div className="flex items-center gap-1">
            <Calendar className="w-2.5 h-2.5 text-muted-foreground" />
            <span
              className={cn(
                "text-[9px] tabular-nums",
                overdue
                  ? "text-rose-600 font-semibold dark:text-rose-400 dark:font-normal dark:drop-shadow-[0_0_4px_hsl(356_80%_52%/0.5)]"
                  : "text-muted-foreground",
              )}
            >
              {project.end_date
                ? format(new Date(project.end_date), "dd MMM yy")
                : "-"}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface ProjectsKanbanProps {
  projects: Project[];
  onEdit: (p: Project) => void;
  onDelete: (id: number) => void;
  isLoading?: boolean;
  projectProgress?: Record<number, number>;
}

export function ProjectsKanban({
  projects,
  onEdit,
  onDelete,
  isLoading,
  projectProgress = {},
}: ProjectsKanbanProps) {
  const { t } = useTranslation();
  const grouped: Record<string, Project[]> = {};
  projects.forEach((p) => {
    const key = p.work_status?.status_name ?? "Unassigned";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  });

  const columns = [
    ...COLUMN_ORDER.filter((s) => grouped[s]?.length > 0),
    ...(grouped["Unassigned"]?.length ? ["Unassigned"] : []),
  ];

  const allProjectIds = projects.map((p) => p.id);

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-64 flex-shrink-0 space-y-2">
            <div className="h-6 rounded-lg bg-secondary animate-pulse" />
            {Array.from({ length: 3 }).map((_, j) => (
              <div
                key={j}
                className="h-24 rounded-xl bg-secondary animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
        {columns.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={FolderKanban}
              title={t("master.projects.empty")}
            />
          </div>
        ) : (
          columns.map((statusName) => {
            const colProjects = grouped[statusName] ?? [];
            const cfg = columnConfig[statusName] ?? columnConfig.Unassigned;

            return (
              <div
                key={statusName}
                className="flex-shrink-0 w-64 flex flex-col gap-2"
              >
                <div
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg bg-secondary border",
                    cfg.border,
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full", cfg.dot)} />
                    <span className={cn("text-xs font-semibold", cfg.header)}>
                      {statusName}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground bg-card px-1.5 py-0.5 rounded border border-border">
                    {colProjects.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {colProjects.map((project, cardIdx) => {
                    const globalIdx = allProjectIds.indexOf(project.id);
                    const avg = projectProgress[project.id] ?? 0;
                    return (
                      <KanbanCard
                        key={project.id}
                        project={project}
                        globalIndex={globalIdx}
                        cardIndex={cardIdx}
                        avgProgress={avg}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
