import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { MultiSelectPopover } from "@/components/ui/multi-select-popover";
import type {
  Project,
  ProjectType,
  WorkStatus,
  UserWithEmail,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ProjectFormValues {
  project_code: string;
  project_name: string;
  client: string;
  pic_name: string;
  pic_contact: string;
  priority: "Low" | "Medium" | "High";
  status_id: number | null;
  start_date: string | null;
  end_date: string | null;
  project_type_ids: number[];
  member_user_ids: string[];
}

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: Project | null;
  projectTypes: ProjectType[];
  workStatuses: WorkStatus[];
  users: UserWithEmail[];
  onSubmit: (data: ProjectFormValues) => void;
  loading?: boolean;
}

const priorityOptions = [
  { value: "Low", label: "Low", dot: "bg-zinc-400" },
  { value: "Medium", label: "Medium", dot: "bg-blue-400" },
  { value: "High", label: "High", dot: "bg-rose-400" },
] as const;

const statusColors: Record<string, string> = {
  MOU: "text-sky-600 dark:text-sky-400",
  Requirement: "text-purple-600 dark:text-purple-400",
  Cancel: "text-red-600 dark:text-red-400",
  "Client Review": "text-amber-600 dark:text-amber-400",
  Quotation: "text-cyan-600 dark:text-cyan-400",
  Done: "text-emerald-600 dark:text-emerald-400",
  Development: "text-indigo-600 dark:text-indigo-400",
};

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  projectTypes,
  workStatuses,
  users,
  onSubmit,
  loading,
}: ProjectFormDialogProps) {
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    defaultValues: {
      priority: "Medium",
      project_type_ids: [],
      member_user_ids: [],
      status_id: null,
    },
  });

  const selectedTypes = watch("project_type_ids") ?? [];
  const selectedMembers = watch("member_user_ids") ?? [];
  const startDate = watch("start_date");
  const endDate = watch("end_date");
  const priority = watch("priority");
  const statusId = watch("status_id");

  useEffect(() => {
    if (project) {
      reset({
        project_code: project.project_code,
        project_name: project.project_name,
        client: project.client,
        pic_name: project.pic_name ?? "",
        pic_contact: project.pic_contact ?? "",
        priority: (project.priority as "Low" | "Medium" | "High") ?? "Medium",
        status_id: project.status_id ?? null,
        start_date: project.start_date ?? null,
        end_date: project.end_date ?? null,
        project_type_ids: project.project_types?.map((tp) => tp.id) ?? [],
        member_user_ids: project.member_user_ids ?? [],
      });
    } else {
      reset({
        project_code: "",
        project_name: "",
        client: "",
        pic_name: "",
        pic_contact: "",
        priority: "Medium",
        status_id: null,
        start_date: null,
        end_date: null,
        project_type_ids: [],
        member_user_ids: [],
      });
    }
  }, [project, reset, open]);

  const typeOptions = projectTypes.map((tp) => ({
    value: tp.id,
    label: tp.type_name,
  }));
  const userOptions = users.map((u) => ({
    value: u.id,
    label: u.employee_role_title
      ? `${u.full_name ?? u.email} · ${u.employee_role_title}`
      : (u.full_name ?? u.email),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base font-semibold">
            {project
              ? t("master.projects.editTitle")
              : t("master.projects.newTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.projects.fields.code")}{" "}
                <span className="text-muted-foreground/40">
                  ({t("master.projects.fields.codeHint")})
                </span>
              </Label>
              <Input
                placeholder="XX-KEYWORD-YEAR"
                className="bg-secondary border-border text-foreground text-sm h-9 font-mono"
                {...register("project_code", { required: true })}
              />
              {errors.project_code && (
                <p className="text-[11px] text-destructive">
                  {t("common.required")}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.projects.fields.name")}
              </Label>
              <Input
                placeholder="Full project name..."
                className="bg-secondary border-border text-foreground text-sm h-9"
                {...register("project_name", { required: true })}
              />
              {errors.project_name && (
                <p className="text-[11px] text-destructive">
                  {t("common.required")}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.projects.fields.client")}
              </Label>
              <Input
                placeholder="Client / company name..."
                className="bg-secondary border-border text-foreground text-sm h-9"
                {...register("client", { required: true })}
              />
              {errors.client && (
                <p className="text-[11px] text-destructive">
                  {t("common.required")}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.projects.fields.status")}{" "}
                <span className="text-muted-foreground/40">
                  ({t("master.projects.fields.statusHint")})
                </span>
              </Label>
              <Select
                value={statusId?.toString() ?? "none"}
                onValueChange={(v) =>
                  setValue("status_id", v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem
                    value="none"
                    className="text-sm text-muted-foreground"
                  >
                    {t("master.projects.fields.noStatus")}
                  </SelectItem>
                  {workStatuses.map((s) => (
                    <SelectItem
                      key={s.id}
                      value={s.id.toString()}
                      className="text-sm"
                    >
                      <span
                        className={
                          statusColors[s.status_name] ?? "text-foreground"
                        }
                      >
                        {s.status_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.projects.fields.picName")}
              </Label>
              <Input
                placeholder="Person in charge..."
                className="bg-secondary border-border text-foreground text-sm h-9"
                {...register("pic_name")}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.projects.fields.picContact")}
              </Label>
              <Input
                placeholder="+62 xxx xxxx xxxx"
                className="bg-secondary border-border text-foreground text-sm h-9"
                {...register("pic_contact")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.projects.fields.priority")}
              </Label>
              <Select
                value={priority}
                onValueChange={(v) =>
                  setValue("priority", v as "Low" | "Medium" | "High")
                }
              >
                <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {priorityOptions.map((p) => (
                    <SelectItem
                      key={p.value}
                      value={p.value}
                      className="text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full inline-block",
                            p.dot,
                          )}
                        />
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.projects.fields.type")}
              </Label>
              <MultiSelectPopover
                options={typeOptions}
                selected={selectedTypes}
                onChange={(vals) => setValue("project_type_ids", vals)}
                placeholder="Select project types..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">
              {t("master.projects.fields.members")}{" "}
              <span className="text-muted-foreground/40">
                ({t("master.projects.fields.membersHint")})
              </span>
            </Label>
            <MultiSelectPopover
              options={userOptions}
              selected={selectedMembers}
              onChange={(vals) => setValue("member_user_ids", vals)}
              placeholder="Select members..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DatePickerField
              label={t("master.projects.fields.startDate")}
              value={startDate ?? null}
              onChange={(v) => setValue("start_date", v)}
              placeholder={t("master.projects.fields.pickDate")}
              clearLabel={t("master.projects.fields.clearDate")}
            />
            <DatePickerField
              label={t("master.projects.fields.endDate")}
              value={endDate ?? null}
              onChange={(v) => setValue("end_date", v)}
              placeholder={t("master.projects.fields.pickDate")}
              clearLabel={t("master.projects.fields.clearDate")}
            />
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border">
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
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  {t("master.projects.saving")}
                </>
              ) : project ? (
                t("master.projects.update")
              ) : (
                t("master.projects.create")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
