import { Plus, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useAssign,
  useToggleReviewer,
  useUnassign,
  useUpdateTask,
  type TaskPatch,
} from "@/hooks/useBoardTasks";
import { canSelfAssign, canUnassign, isBoardPic } from "@/lib/taskPermissions";
import { lineageAssigneeIds, type TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { AvatarStack } from "./AvatarStack";
import { LabelPicker } from "./LabelPicker";
import { PeoplePicker } from "./PeoplePicker";
import { PRIORITIES, PRIORITY_STYLE } from "./taskStyles";

const NONE = "none";

const LABEL = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const DATE_TRIGGER = "h-8 text-xs bg-background border-input hover:bg-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className={LABEL}>{label}</Label>
      {children}
    </div>
  );
}

export function TaskMetaFields({ node }: { node: TaskNode }) {
  const { t } = useTranslation();
  const { boardId, byId, divisions, access, canWork } = useBoardCtx();
  const task = node.task;
  const editable = canWork(task.id) || task.created_by === access.userId;
  const update = useUpdateTask(boardId);
  const assign = useAssign(boardId);
  const unassign = useUnassign(boardId);
  const toggleReviewer = useToggleReviewer(boardId);
  const save = (patch: TaskPatch) => update.mutate({ id: task.id, ...patch });
  const assigneeIds = task.assignees.map((a) => a.user_id);
  const canAssign = canWork(task.id) || (assigneeIds.length === 0 && task.created_by === access.userId);
  const pic = isBoardPic(access);

  const addButton = (
    <button type="button" className="rounded-full border border-dashed border-border p-1 text-muted-foreground hover:bg-muted" aria-label={t("board.meta.add")}>
      <Plus className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      <Field label={t("board.meta.assignees")}>
        <div className="flex items-center gap-2">
          <AvatarStack userIds={assigneeIds} max={6} />
          {canAssign && (
            <PeoplePicker
              selected={assigneeIds}
              isLocked={(uid) => task.status === "in_review" || !canUnassign(access, task.assignees.find((a) => a.user_id === uid)?.assigned_by ?? null)}
              onToggle={(userId, on) => (on ? assign : unassign).mutate({ taskId: task.id, userId })}
              trigger={addButton}
            />
          )}
        </div>
        {canSelfAssign(access, node, lineageAssigneeIds(byId, task.id)) && (
          <button
            type="button"
            onClick={() => assign.mutate({ taskId: task.id, userId: access.userId })}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {t("board.meta.assignMe")}
          </button>
        )}
      </Field>

      <Field label={t("board.meta.reviewers")}>
        <div className="flex items-center gap-2">
          {task.reviewers.length ? (
            <AvatarStack userIds={task.reviewers.map((r) => r.user_id)} />
          ) : (
            <span className="text-xs text-muted-foreground">{t("board.meta.reviewersDefault")}</span>
          )}
          {pic && (
            <PeoplePicker
              selected={task.reviewers.map((r) => r.user_id)}
              onToggle={(userId, on) => toggleReviewer.mutate({ taskId: task.id, userId, on })}
              trigger={addButton}
            />
          )}
        </div>
      </Field>

      <Field label={t("board.meta.division")}>
        <Select
          disabled={!editable}
          value={task.division_id ? String(task.division_id) : NONE}
          onValueChange={(v) => save({ division_id: v === NONE ? null : Number(v) })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-xs">{t("board.meta.none")}</SelectItem>
            {divisions.filter((d) => d.is_active || d.id === task.division_id).map((d) => (
              <SelectItem key={d.id} value={String(d.id)} className="text-xs">{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={t("board.meta.priority")}>
        <Select disabled={!editable} value={task.priority} onValueChange={(v) => save({ priority: v as TaskPatch["priority"] })}>
          <SelectTrigger className={cn("h-8 text-xs", PRIORITY_STYLE[task.priority])}><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p} className={cn("text-xs", PRIORITY_STYLE[p])}>{t(`board.priority.${p}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <DatePickerField
        label={t("board.meta.start")}
        value={task.start_date}
        onChange={(v) => save({ start_date: v })}
        clearLabel={t("board.meta.clear")}
        className="space-y-1"
        disabled={!editable}
        labelClassName={LABEL}
        triggerClassName={DATE_TRIGGER}
      />
      <DatePickerField
        label={t("board.meta.due")}
        value={task.due_date}
        fromDate={task.start_date}
        onChange={(v) => save({ due_date: v })}
        clearLabel={t("board.meta.clear")}
        className="space-y-1"
        disabled={!editable}
        labelClassName={LABEL}
        triggerClassName={DATE_TRIGGER}
      />

      <Field label={t("board.meta.estimate")}>
        <Input
          type="number"
          min={0}
          step={0.5}
          disabled={!editable}
          defaultValue={task.estimate_hours ?? ""}
          key={task.estimate_hours ?? "none"}
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== task.estimate_hours) save({ estimate_hours: v });
          }}
          className="h-8 text-xs"
        />
      </Field>

      <Field label={t("board.meta.labels")}>
        <LabelPicker task={task} editable={canWork(task.id)} />
      </Field>
    </div>
  );
}
