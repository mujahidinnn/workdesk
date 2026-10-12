import type { TaskPriority, TaskStatus } from "@/lib/types";

export const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  in_review: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

export const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: "text-muted-foreground",
  medium: "text-sky-600 dark:text-sky-400",
  high: "text-amber-600 dark:text-amber-400",
  urgent: "text-red-600 dark:text-red-400",
};

export const STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
export const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];
