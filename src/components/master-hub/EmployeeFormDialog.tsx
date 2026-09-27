import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
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
import type { Employee, EmploymentType } from "@/lib/types";

const EMPLOYMENT_TYPES: EmploymentType[] = [
  "Permanent",
  "Contract",
  "Probation",
  "Intern",
];

// Probation and interns get no annual leave by default; admin can override.
const DEFAULT_LEAVE_QUOTA: Record<EmploymentType, number> = {
  Permanent: 12,
  Contract: 12,
  Probation: 0,
  Intern: 0,
};

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee?: Employee | null;
  onSubmit: (data: EmployeeFormValues) => void;
  loading?: boolean;
}

export interface EmployeeFormValues {
  full_name: string;
  role_title: string;
  status: "Active" | "Inactive";
  employee_number: string | null;
  department: string | null;
  employment_type: EmploymentType;
  join_date: string | null;
  resign_date: string | null;
  annual_leave_quota: number;
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
  onSubmit,
  loading,
}: EmployeeFormDialogProps) {
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    defaultValues: {
      status: "Active",
      employment_type: "Permanent",
      annual_leave_quota: 12,
    },
  });

  useEffect(() => {
    if (employee) {
      reset({
        full_name: employee.full_name,
        role_title: employee.role_title,
        status: employee.status,
        employee_number: employee.employee_number,
        department: employee.department,
        employment_type: employee.employment_type,
        join_date: employee.join_date,
        resign_date: employee.resign_date,
        annual_leave_quota: employee.annual_leave_quota,
      });
    } else {
      reset({
        full_name: "",
        role_title: "",
        status: "Active",
        employee_number: null,
        department: null,
        employment_type: "Permanent",
        join_date: null,
        resign_date: null,
        annual_leave_quota: 12,
      });
    }
  }, [employee, reset, open]);

  const isInactive = watch("status") === "Inactive";
  const joinDate = watch("join_date");

  const submit = (data: EmployeeFormValues) =>
    onSubmit({ ...data, resign_date: isInactive ? data.resign_date : null });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base font-semibold">
            {employee
              ? t("master.employees.editTitle")
              : t("master.employees.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">
              {t("master.employees.fields.fullName")}
            </Label>
            <Input
              placeholder={t("master.employees.fields.fullNamePlaceholder")}
              className="bg-secondary border-border text-foreground text-sm h-9"
              {...register("full_name", { required: true })}
            />
            {errors.full_name && (
              <p className="text-[11px] text-destructive">
                {t("master.employees.required")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">
              {t("master.employees.fields.roleTitle")}
            </Label>
            <Input
              placeholder={t("master.employees.fields.roleTitlePlaceholder")}
              className="bg-secondary border-border text-foreground text-sm h-9"
              {...register("role_title", { required: true })}
            />
            {errors.role_title && (
              <p className="text-[11px] text-destructive">
                {t("master.employees.required")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.employees.fields.employeeNumber")}
              </Label>
              <Input
                placeholder="EMP-001"
                className="bg-secondary border-border text-foreground text-sm h-9"
                {...register("employee_number")}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.employees.fields.department")}
              </Label>
              <Input
                className="bg-secondary border-border text-foreground text-sm h-9"
                placeholder={t("master.employees.fields.departmentPlaceholder")}
                {...register("department")}
              />
            </div>
          </div>

          <Controller
            control={control}
            name="join_date"
            rules={{ required: true }}
            render={({ field }) => (
              <DatePickerField
                label={t("master.employees.fields.joinDate")}
                value={field.value ?? null}
                onChange={field.onChange}
                required
                error={
                  errors.join_date ? t("master.employees.required") : undefined
                }
              />
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.employees.fields.employmentType")}
              </Label>
              <Select
                value={watch("employment_type")}
                onValueChange={(v) => {
                  setValue("employment_type", v as EmploymentType);
                  setValue(
                    "annual_leave_quota",
                    DEFAULT_LEAVE_QUOTA[v as EmploymentType],
                  );
                }}
              >
                <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {EMPLOYMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="text-sm">
                      {t(`master.employees.employmentTypes.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.employees.fields.leaveQuota")}
              </Label>
              <Input
                type="number"
                min={0}
                className="bg-secondary border-border text-foreground text-sm h-9"
                {...register("annual_leave_quota", {
                  valueAsNumber: true,
                  required: true,
                  min: 0,
                  max: 365,
                  validate: Number.isInteger,
                })}
              />
              {errors.annual_leave_quota && (
                <p className="text-[11px] text-destructive">
                  {t("master.employees.leaveQuotaInvalid")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">
              {t("master.employees.fields.status")}
            </Label>
            <Select
              value={watch("status")}
              onValueChange={(v) =>
                setValue("status", v as "Active" | "Inactive")
              }
            >
              <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="Active" className="text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    {t("master.employees.fields.active")}
                  </span>
                </SelectItem>
                <SelectItem value="Inactive" className="text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 inline-block" />
                    {t("master.employees.fields.inactive")}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isInactive && (
            <Controller
              control={control}
              name="resign_date"
              rules={{
                validate: (v) => {
                  if (!v) return t("master.employees.required");
                  if (joinDate && v < joinDate)
                    return t("master.employees.resignBeforeJoin");
                  return true;
                },
              }}
              render={({ field }) => (
                <DatePickerField
                  label={t("master.employees.fields.resignDate")}
                  value={field.value ?? null}
                  onChange={field.onChange}
                  fromDate={joinDate}
                  required
                  error={errors.resign_date?.message}
                />
              )}
            />
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
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  {t("master.employees.saving")}
                </>
              ) : employee ? (
                t("master.employees.update")
              ) : (
                t("master.employees.add")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
