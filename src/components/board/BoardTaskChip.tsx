import { Link } from "react-router-dom";
import { SquareKanban } from "lucide-react";

export interface LinkedBoardTask {
  id: number;
  task_no: number;
  board_id: number;
  title: string;
}

export function BoardTaskChip({ task }: { task: LinkedBoardTask }) {
  return (
    <Link
      to={`/boards/${task.board_id}?task=${task.task_no}`}
      onClick={(e) => e.stopPropagation()}
      title={task.title}
      className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
    >
      <SquareKanban className="h-3 w-3" />#{task.task_no}
    </Link>
  );
}
