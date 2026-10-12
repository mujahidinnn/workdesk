import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ArchiveRestore, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { SearchInput } from "@/components/master-hub/MasterSection";
import { useArchivedTasks, useProfiles, type ArchivedTask } from "@/hooks/useBoard";
import { useUpdateTask } from "@/hooks/useBoardTasks";
import { isBoardPic } from "@/lib/taskPermissions";
import { cn } from "@/lib/utils";
import { useBoardCtx } from "./BoardContext";
import { AvatarStack } from "./AvatarStack";
import { STATUS_STYLE } from "./taskStyles";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children || "-"}</dd>
    </div>
  );
}

export function ArchivedDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { boardId, access, people, divisions } = useBoardCtx();
  const { data: tasks = [], isLoading } = useArchivedTasks(boardId, open);
  const { data: actors = [] } = useProfiles(tasks.map((x) => x.archived_by).filter((id): id is string => !!id));
  const update = useUpdateTask(boardId);
  const pic = isBoardPic(access);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<ArchivedTask | null>(null);

  const who = (id: string | null) =>
    // A profile we can't read at all is the superadmin's (profiles_select hides it).
    id ? (people.get(id)?.profile?.full_name ?? actors.find((a) => a.id === id)?.full_name ?? t("board.superadmin")) : "-";
  const shown = tasks.filter((x) => `#${x.task_no} ${x.title}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("board.archived.title")}</DialogTitle>
          <DialogDescription>{t("board.archived.hint")}</DialogDescription>
        </DialogHeader>
        {tasks.length > 3 && <SearchInput value={q} onChange={setQ} placeholder={t("board.filter.search")} />}
        <div className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 scrollbar-thin">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("board.archived.empty")}</p>
          ) : (
            shown.map((task) => {
              const isOpen = expanded === task.id;
              const done = task.steps.filter((s) => s.is_done).length;
              return (
                <div key={task.id} className="rounded-lg border border-border">
                  <div className="flex items-start gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : task.id)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                      aria-expanded={isOpen}
                    >
                      <ChevronRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                      <span className="min-w-0">
                        <span className="block text-sm">
                          <span className="mr-1 font-mono text-xs text-muted-foreground">#{task.task_no}</span>
                          {task.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {task.parent
                            ? t("board.archived.under", { no: task.parent.task_no, title: task.parent.title })
                            : t("board.archived.inColumn", { column: task.column?.name ?? "-" })}
                          {" · "}
                          {t("board.archived.by", {
                            name: who(task.archived_by),
                            at: format(parseISO(task.archived_at), "d MMM yyyy, HH:mm"),
                          })}
                        </span>
                      </span>
                    </button>
                    {pic && (
                      <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs" onClick={() => setRestoring(task)}>
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        {t("board.archived.restore")}
                      </Button>
                    )}
                  </div>
                  {isOpen && (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border px-3 py-3">
                      <Row label={t("board.list.status")}>
                        <span className={cn("rounded px-1.5 py-0.5 text-[11px]", STATUS_STYLE[task.status as keyof typeof STATUS_STYLE])}>
                          {t(`board.status.${task.status}`)}
                        </span>
                      </Row>
                      <Row label={t("board.meta.assignees")}>
                        {task.assignees.length > 0 && <AvatarStack userIds={task.assignees.map((a) => a.user_id)} max={8} />}
                      </Row>
                      <Row label={t("board.meta.division")}>{divisions.find((d) => d.id === task.division_id)?.name}</Row>
                      <Row label={t("board.meta.due")}>{task.due_date && format(parseISO(task.due_date), "d MMM yyyy")}</Row>
                      <Row label={t("board.steps.title")}>{task.steps.length > 0 && `${done}/${task.steps.length}`}</Row>
                      <Row label={t("board.subtasks.title")}>{task.children.length > 0 && String(task.children.length)}</Row>
                      <Row label={t("board.fields.description")}>
                        {task.description && <span className="whitespace-pre-wrap">{task.description}</span>}
                      </Row>
                      <Row label={t("board.fields.expected_output")}>
                        {task.expected_output && <span className="whitespace-pre-wrap">{task.expected_output}</span>}
                      </Row>
                    </dl>
                  )}
                </div>
              );
            })
          )}
        </div>
        <DeleteConfirmationModal
          open={!!restoring}
          onOpenChange={(o) => !o && setRestoring(null)}
          title={t("board.archived.restoreTitle")}
          description={t("board.archived.restoreDesc", { title: restoring ? `#${restoring.task_no} ${restoring.title}` : "" })}
          confirmLabel={t("board.archived.restore")}
          confirmIcon={ArchiveRestore}
          isPending={update.isPending}
          onConfirm={() =>
            restoring &&
            update.mutate(
              { id: restoring.id, archived_at: null },
              {
                onSuccess: async () => {
                  await qc.invalidateQueries({ queryKey: ["board-archived", boardId] });
                  setRestoring(null);
                },
              },
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
