import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskAttachments } from "./TaskAttachments";
import type { DailyTaskWithRelations, Employee, Project } from "@/lib/types";

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: DailyTaskWithRelations | null;
  employees: Employee[];
  projects: Project[];
  onSubmit: (data: TaskFormValues) => void;
  loading?: boolean;
}

export interface TaskFormValues {
  date: string;
  employee_id: number;
  project_id: number;
  task_desc: string;
  progress_pct: number;
  problem_desc?: string;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  employees,
  projects,
  onSubmit,
  loading,
}: TaskFormDialogProps) {
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      progress_pct: 0,
    },
  });

  useEffect(() => {
    if (task) {
      reset({
        date: task.date,
        employee_id: task.employee_id,
        project_id: task.project_id,
        task_desc: task.task_desc,
        progress_pct: task.progress_pct,
        problem_desc: task.problem_desc || "",
      });
    } else {
      reset({
        date: new Date().toISOString().split("T")[0],
        progress_pct: 0,
        task_desc: "",
        problem_desc: "",
      });
    }
  }, [task, reset, open]);

  const progress = watch("progress_pct");

  const handleFormSubmit = (data: TaskFormValues) => {
    onSubmit({
      ...data,
      employee_id: Number(data.employee_id),
      project_id: Number(data.project_id),
      progress_pct: Number(data.progress_pct),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base font-semibold">
            {task ? t("taskForm.editTitle") : t("taskForm.logTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <DatePickerField
              label={t("taskForm.fields.date")}
              value={watch("date") ?? null}
              onChange={(v) => setValue("date", v ?? "")}
              required
            />

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("taskForm.fields.progress")}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="bg-secondary border-border text-foreground text-sm h-9 flex-1"
                  {...register("progress_pct", {
                    required: true,
                    min: 0,
                    max: 100,
                  })}
                />
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 w-8 text-right tabular-nums">
                  {progress}%
                </span>
              </div>
              {errors.progress_pct && (
                <p className="text-[11px] text-destructive">
                  {t("taskForm.progressError")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">
              {t("taskForm.fields.employee")}
            </Label>
            <Select
              value={watch("employee_id")?.toString()}
              onValueChange={(v) => setValue("employee_id", Number(v))}
            >
              <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
                <SelectValue
                  placeholder={t("taskForm.placeholders.employee")}
                />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
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
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">
              {t("taskForm.fields.project")}
            </Label>
            <Select
              value={watch("project_id")?.toString()}
              onValueChange={(v) => setValue("project_id", Number(v))}
            >
              <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
                <SelectValue placeholder={t("taskForm.placeholders.project")} />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
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
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">
              {t("taskForm.fields.taskDesc")}
            </Label>
            <Textarea
              placeholder={t("taskForm.placeholders.taskDesc")}
              className="bg-secondary border-border text-foreground text-sm min-h-[70px] resize-none"
              {...register("task_desc", { required: true })}
            />
            {errors.task_desc && (
              <p className="text-[11px] text-destructive">
                {t("taskForm.required")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">
              {t("taskForm.fields.problem")}{" "}
              <span className="text-muted-foreground/50">
                {t("taskForm.fields.problemOptional")}
              </span>
            </Label>
            <Textarea
              placeholder={t("taskForm.placeholders.problem")}
              className="bg-secondary border-border text-foreground text-sm min-h-[60px] resize-none"
              {...register("problem_desc")}
            />
          </div>

          {/* Attachments need a saved task id. */}
          {task ? (
            <TaskAttachments taskId={task.id} />
          ) : (
            <p className="text-[11px] text-muted-foreground/60">
              {t("taskForm.attachments.saveFirst")}
            </p>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? (
                t("taskForm.saving")
              ) : task ? (
                t("taskForm.update")
              ) : (
                t("taskForm.log")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
