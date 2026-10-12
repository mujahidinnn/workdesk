import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useReviewTask } from "@/hooks/useBoardTasks";
import { useBoardCtx } from "./BoardContext";

export function ReviewDialog({
  taskId,
  decision,
  onClose,
}: {
  taskId: number;
  decision: "approved" | "rejected" | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { boardId } = useBoardCtx();
  const review = useReviewTask(boardId);
  const [note, setNote] = useState("");
  const needsNote = decision === "rejected" && !note.trim();

  return (
    <Dialog open={decision != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {decision === "approved" ? t("board.review.approveTitle") : t("board.review.rejectTitle")}
          </DialogTitle>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={decision === "rejected" ? t("board.review.rejectPlaceholder") : t("board.review.notePlaceholder")}
          className="min-h-[100px] text-sm"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            disabled={needsNote}
            loading={review.isPending}
            variant={decision === "rejected" ? "destructive" : "default"}
            onClick={() =>
              decision &&
              review.mutate(
                { taskId, decision, note },
                {
                  onSuccess: () => {
                    setNote("");
                    onClose();
                  },
                },
              )
            }
          >
            {decision === "approved" ? t("board.review.approve") : t("board.review.reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
