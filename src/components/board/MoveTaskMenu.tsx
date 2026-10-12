import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useMoveTask, useMoveTaskToBoard, useReparentTask } from "@/hooks/useBoardTasks";
import { useBoardStats } from "@/hooks/useBoards";
import { useProjects } from "@/hooks/useProjects";
import { useNavigate } from "react-router-dom";
import { lineage, type TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";

export function MoveTaskMenu({ node }: { node: TaskNode }) {
  const { t } = useTranslation();
  const { boardId, data, roots, byId, canWork } = useBoardCtx();
  const move = useMoveTask(boardId);
  const reparent = useReparentTask(boardId);
  const toBoard = useMoveTaskToBoard(boardId);
  const navigate = useNavigate();
  const { data: stats = {} } = useBoardStats();
  const { data: projects = [] } = useProjects();
  const otherBoards = Object.values(stats)
    .filter((s) => s.board_id !== boardId)
    .map((s) => ({ id: s.board_id, project: projects.find((p) => p.id === s.project_id) }))
    .filter((b) => b.project);
  const [picking, setPicking] = useState(false);
  const task = node.task;
  if (!canWork(task.id)) return null;

  const lastId = (list: TaskNode[]) => list[list.length - 1]?.task.id ?? null;
  const lastRootIn = (columnId: number) =>
    lastId(roots.filter((r) => r.task.column_id === columnId && r.task.id !== task.id));

  function toColumn(columnId: number) {
    const beforeId = lastRootIn(columnId);
    if (task.parent_id == null) move.mutate({ taskId: task.id, columnId, beforeId, afterId: null });
    else reparent.mutate({ taskId: task.id, parentId: null, columnId, beforeId, afterId: null });
  }

  const candidates = [...byId.values()].filter(
    (n) => n.task.id !== task.parent_id && !lineage(byId, n.task.id).some((a) => a.task.id === task.id) && canWork(n.task.id),
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
            {t("board.move.title")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {task.parent_id == null ? t("board.move.toColumn") : t("board.move.promote")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {data.columns.map((c) => (
                <DropdownMenuItem key={c.id} disabled={c.id === task.column_id} onClick={() => toColumn(c.id)}>
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => setPicking(true)}>{t("board.move.underTask")}</DropdownMenuItem>
          {task.parent_id == null && otherBoards.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t("board.move.toBoard")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {otherBoards.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={() =>
                      toBoard.mutate(
                        { taskId: task.id, targetBoardId: b.id },
                        { onSuccess: () => navigate(`/boards/${b.id}`) },
                      )
                    }
                  >
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{b.project!.project_code}</span>
                    {b.project!.project_name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>{t("board.move.underTask")}</DialogTitle>
          </DialogHeader>
          <Command>
            <CommandInput placeholder={t("board.move.search")} />
            <CommandList>
              <CommandEmpty>{t("board.move.none")}</CommandEmpty>
              {candidates.map((n) => (
                <CommandItem
                  key={n.task.id}
                  value={`#${n.task.task_no} ${n.task.title}`}
                  onSelect={() => {
                    setPicking(false);
                    reparent.mutate({
                      taskId: task.id,
                      parentId: n.task.id,
                      beforeId: lastId(n.children),
                      afterId: null,
                    });
                  }}
                >
                  <span className="mr-2 font-mono text-xs text-muted-foreground">#{n.task.task_no}</span>
                  <span style={{ paddingLeft: n.task.depth * 12 }}>{n.task.title}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
