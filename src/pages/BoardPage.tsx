import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageFallback } from "@/components/layout/PageFallback";
import { BoardProvider, useBoardCtx } from "@/components/board/BoardContext";
import { BoardHeader, type BoardView } from "@/components/board/BoardHeader";
import { BoardColumns } from "@/components/board/BoardColumns";
import { BoardListView } from "@/components/board/BoardListView";
import { TaskDetailDialog } from "@/components/board/TaskDetailDialog";
import { WorkloadTable } from "@/components/board/WorkloadTable";
import { ArchivedDialog } from "@/components/board/ArchivedDialog";
import { useBoard } from "@/hooks/useBoard";
import { EMPTY_FILTER, filterFromParams, filterToParams, matchesFilter, type BoardFilter } from "@/lib/boardFilter";
import { summarizeWorkload } from "@/lib/workload";

function BoardScreen() {
  const { data, roots } = useBoardCtx();
  const [params, setParams] = useSearchParams();
  const filter = useMemo(() => filterFromParams(params), [params]);
  const setFilter = (f: BoardFilter) =>
    setParams((p) => { filterToParams(f, p); return p; }, { replace: true });
  const rawView = params.get("view");
  const view: BoardView = rawView === "list" || rawView === "workload" ? rawView : "board";
  const setView = (v: BoardView) =>
    setParams((p) => { if (v === "board") p.delete("view"); else p.set("view", v); return p; }, { replace: true });

  const visible = useMemo(() => {
    const today = new Date();
    return new Set(roots.filter((r) => matchesFilter(r, filter, today)).map((r) => r.task.id));
  }, [roots, filter]);

  const workload = useMemo(
    () =>
      summarizeWorkload(
        data.tasks.flatMap((x) => x.assignees.map((a) => ({ user_id: a.user_id, status: x.status, due_date: x.due_date, completed_at: x.completed_at }))),
        new Date(),
      ),
    [data.tasks],
  );

  const openSteps = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of data.tasks)
      for (const s of x.steps) if (!s.is_done && s.assignee_id) m.set(s.assignee_id, (m.get(s.assignee_id) ?? 0) + 1);
    return m;
  }, [data.tasks]);

  const taskNo = params.get("task");
  const [archivedOpen, setArchivedOpen] = useState(false);
  useEffect(() => {
    if (taskNo && !data.tasks.some((x) => x.task_no === Number(taskNo))) {
      setArchivedOpen(true);
      setParams((p) => { p.delete("task"); return p; }, { replace: true });
    }
  }, [taskNo, data.tasks, setParams]);
  const openTask = (no: number) => setParams((p) => { p.set("task", String(no)); return p; });
  const closeTask = () => setParams((p) => { p.delete("task"); return p; });

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
      <BoardHeader filter={filter} onFilter={setFilter} view={view} onView={setView} onArchived={() => setArchivedOpen(true)} />
      <div className="min-h-0 flex-1">
        {view === "board" && <BoardColumns visible={visible} onOpen={openTask} />}
        {view === "list" && <BoardListView visible={visible} onOpen={openTask} />}
        {view === "workload" && (
          <WorkloadTable
            counts={workload}
            steps={openSteps}
            members={data.members}
            onPick={(userId) =>
              // One URL update: two in a row would each start from the old params.
              setParams((p) => {
                filterToParams({ ...EMPTY_FILTER, assignee: userId }, p);
                p.delete("view");
                return p;
              }, { replace: true })
            }
          />
        )}
      </div>
      <TaskDetailDialog taskNo={taskNo ? Number(taskNo) : null} onOpen={openTask} onClose={closeTask} />
      <ArchivedDialog open={archivedOpen} onOpenChange={setArchivedOpen} />
    </div>
  );
}

export default function BoardPage() {
  const boardId = Number(useParams().boardId);
  const { data, isLoading, error } = useBoard(boardId);
  if (isLoading) return <PageFallback />;
  if (error || !data) return <p className="text-sm text-destructive">{(error as Error | null)?.message ?? "Board not found"}</p>;
  return (
    <BoardProvider data={data}>
      <BoardScreen />
    </BoardProvider>
  );
}
