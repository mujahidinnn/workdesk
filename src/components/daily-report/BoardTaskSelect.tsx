import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBoardTaskRef, useMyTasks } from "@/hooks/useMyTasks";

const NONE = "none";

export function BoardTaskSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const { t } = useTranslation();
  const { data } = useMyTasks();
  const { data: current } = useBoardTaskRef(value);
  const options = new Map<number, { id: number; task_no: number; title: string; board: { name: string } }>();
  for (const task of data?.assigned ?? []) if (task.status !== "done" || task.id === value) options.set(task.id, task);
  for (const s of data?.steps ?? []) options.set(s.task.id, s.task);
  if (current) options.set(current.id, current);
  const open = [...options.values()];
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground font-medium">
        {t("taskForm.fields.boardTask")}{" "}
        <span className="text-muted-foreground/50">
          {t("taskForm.fields.problemOptional")}
        </span>
      </Label>
      <Select
        value={value ? String(value) : NONE}
        onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
      >
        <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          <SelectItem value={NONE} className="text-sm">
            {t("taskForm.placeholders.boardTask")}
          </SelectItem>
          {open.map((task) => (
            <SelectItem key={task.id} value={String(task.id)} className="text-sm">
              <span className="font-mono text-xs text-primary">#{task.task_no}</span>
              <span className="ml-2">{task.title}</span>
              <span className="ml-2 text-muted-foreground text-xs">{task.board.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
