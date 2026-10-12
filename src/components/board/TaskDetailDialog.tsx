import { useEffect, useRef, useState } from "react";
import { Archive, ArrowUp, ChevronRight, History, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { TaskComments } from "@/components/daily-report/TaskComments";
import { TaskAttachments } from "@/components/daily-report/TaskAttachments";
import { useUpdateTask } from "@/hooks/useBoardTasks";
import { isBoardPic } from "@/lib/taskPermissions";
import { lineage } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { EditableText } from "./EditableText";
import { MoveTaskMenu } from "./MoveTaskMenu";
import { TaskActivityFeed } from "./TaskActivityFeed";
import { TaskDailyLogs } from "./TaskDailyLogs";
import { TaskMetaFields } from "./TaskMetaFields";
import { TaskStatusBar } from "./TaskStatusBar";
import { TaskSteps } from "./TaskSteps";
import { TaskSubtree } from "./TaskSubtree";

export function TaskDetailDialog({
  taskNo,
  onOpen,
  onClose,
}: {
  taskNo: number | null;
  onOpen: (taskNo: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { boardId, byId, data, access, canWork } = useBoardCtx();
  const update = useUpdateTask(boardId);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    setShowTop(false);
  }, [taskNo]);
  const row = taskNo == null ? undefined : data.tasks.find((x) => x.task_no === taskNo);
  const node = row ? byId.get(row.id) : undefined;
  if (!node) return null;

  const task = node.task;
  const editable = canWork(task.id) || task.created_by === access.userId;
  const column = data.columns.find((c) => c.id === lineage(byId, task.id)[0]?.task.column_id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex h-[90vh] max-w-5xl flex-col gap-0 p-0"
        // Esc inside a field cancels that edit; it should not close the task.
        onEscapeKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("input, textarea")) e.preventDefault();
        }}
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_340px]">
          <div
            ref={scroller}
            onScroll={(e) => setShowTop(e.currentTarget.scrollTop > 300)}
            className="min-h-0 space-y-5 overflow-y-auto p-5 scrollbar-thin"
          >
            <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {column && <span className="rounded bg-muted px-1.5 py-0.5">{column.name}</span>}
              {lineage(byId, task.id).slice(0, -1).map((a) => (
                <button key={a.task.id} type="button" onClick={() => onOpen(a.task.task_no)} className="inline-flex items-center gap-1 hover:text-foreground">
                  <ChevronRight className="h-3 w-3" />#{a.task.task_no} {a.task.title}
                </button>
              ))}
            </nav>

            <div>
              <DialogTitle asChild>
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 font-mono text-sm text-muted-foreground">#{task.task_no}</span>
                  <EditableText
                    value={task.title}
                    multiline={false}
                    disabled={!editable}
                    placeholder={t("board.card.titlePlaceholder")}
                    onSave={(v) => v && update.mutate({ id: task.id, title: v })}
                    className="text-lg font-semibold"
                  />
                </div>
              </DialogTitle>
              <DialogDescription className="sr-only">{t("board.card.detail")}</DialogDescription>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <TaskStatusBar node={node} />
              <div className="flex gap-2">
                <MoveTaskMenu node={node} />
                {isBoardPic(access) && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(true)}>
                    <Archive className="mr-1 h-3.5 w-3.5" />
                    {t("board.actions.archive")}
                  </Button>
                )}
              </div>
            </div>

            <TaskMetaFields node={node} />

            <section className="space-y-1">
              <h3 className="text-sm font-semibold">{t("board.fields.description")}</h3>
              <EditableText
                value={task.description}
                disabled={!editable}
                placeholder={t("board.card.descriptionPlaceholder")}
                onSave={(v) => update.mutate({ id: task.id, description: v })}
              />
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-semibold">{t("board.fields.expected_output")}</h3>
              <EditableText
                value={task.expected_output}
                disabled={!editable}
                placeholder={t("board.card.outputPlaceholder")}
                onSave={(v) => update.mutate({ id: task.id, expected_output: v })}
                className="border-l-2 border-primary/40"
              />
            </section>

            <TaskSteps taskId={task.id} />
            <TaskSubtree node={node} onOpen={onOpen} />
            <TaskAttachments taskId={task.id} source="board" canManage={isBoardPic(access)} />
            <TaskDailyLogs taskId={task.id} />
            {showTop && (
              <div className="pointer-events-none sticky bottom-0 flex justify-end">
                <Button
                  size="icon"
                  variant="secondary"
                  className="pointer-events-auto h-9 w-9 rounded-full shadow-lg"
                  onClick={() => scroller.current?.scrollTo({ top: 0, behavior: "smooth" })}
                  aria-label={t("board.card.toTop")}
                  title={t("board.card.toTop")}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <aside className="flex min-h-0 flex-col border-t border-border p-4 md:border-l md:border-t-0">
            <Tabs defaultValue="comments" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="self-start">
                <TabsTrigger value="comments" className="gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {t("board.tabs.comments")}
                </TabsTrigger>
                <TabsTrigger value="activity" className="gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  {t("board.tabs.activity")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="comments" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                <TaskComments taskId={task.id} source="board" canModerate={isBoardPic(access)} />
              </TabsContent>
              <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                <TaskActivityFeed taskId={task.id} />
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      </DialogContent>
      <DeleteConfirmationModal
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={t("board.archive.title")}
        description={t("board.archive.description", { title: `#${task.task_no} ${task.title}`, })}
        confirmLabel={t("board.actions.archive")}
        confirmIcon={Archive}
        isPending={update.isPending}
        onConfirm={() =>
          update.mutate(
            { id: task.id, archived_at: new Date().toISOString() },
            {
              onSuccess: () => {
                setConfirmArchive(false);
                onClose();
              },
            },
          )
        }
      />
    </Dialog>
  );
}
