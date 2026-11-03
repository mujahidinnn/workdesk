import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAiPanel } from "@/components/ai/AiProvider";
import {
  isStaleExecuting,
  useCancelProposal,
  useExecuteProposal,
  type AiProposal,
} from "@/hooks/useAi";
import { getTool } from "../../../supabase/functions/_shared/aiCatalog.ts";

interface Props {
  messageId: number;
  proposal: AiProposal;
  mode: "confirm" | "countdown";
  /** More than 5 writes in one answer: the whole batch counts as critical. */
  batchCritical: boolean;
}

const TIER_STYLE = {
  read: "bg-muted text-muted-foreground",
  write: "bg-primary/10 text-primary",
  critical: "bg-destructive/10 text-destructive",
} as const;

export function ProposalCard({ messageId, proposal, mode, batchCritical }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { scheduler, setOpen } = useAiPanel();
  const execute = useExecuteProposal();
  const cancel = useCancelProposal();
  const { id, status } = proposal;

  // The scheduler does not notify, so redraw while a countdown runs.
  const running = scheduler.isRunning(id);
  const [, tick] = useState(0);
  // Also tick while a countdown may still be armed by the runner, so the card picks it up within 250 ms.
  const watching = running || (mode === "countdown" && proposal.status === "pending");
  useEffect(() => {
    if (!watching) return;
    const h = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(h);
  }, [watching]);

  const tier = batchCritical ? "critical" : (getTool(proposal.tool)?.tier ?? "write");
  const stale = isStaleExecuting(proposal);
  const boardId = proposal.result?.board_id;

  const run = () => {
    scheduler.cancel(id);
    execute.mutate({ messageId, proposal });
  };

  return (
    <div className="rounded-lg border border-border bg-background/60 p-3 text-sm flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-foreground break-words min-w-0">{proposal.summary}</p>
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase", TIER_STYLE[tier])}>
          {t(`ai.tier.${tier}`)}
        </span>
      </div>

      {status === "pending" && (
        <div className="flex items-center gap-2">
          {running ? (
            <>
              <span className="text-xs text-muted-foreground">
                {t("ai.runsIn", { s: Math.max(1, Math.ceil(scheduler.remaining(id) / 1000)) })}
              </span>
              <Button size="sm" variant="outline" disabled={cancel.isPending}
                onClick={() => cancel.mutate({ messageId, proposalId: id })}>
                {t("ai.cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" disabled={execute.isPending} onClick={run}>{t("ai.run")}</Button>
              <Button size="sm" variant="outline" disabled={cancel.isPending}
                onClick={() => cancel.mutate({ messageId, proposalId: id })}>
                {t("ai.cancel")}
              </Button>
              {mode === "countdown" && (
                <span className="text-xs text-muted-foreground">{t("ai.waitingRun")}</span>
              )}
            </>
          )}
        </div>
      )}

      {status === "executing" && (
        <p className="text-xs text-muted-foreground">
          {stale ? t("ai.statusUnknown") : t("ai.running")}
        </p>
      )}
      {status === "executed" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t("ai.executed")}</span>
          {typeof boardId === "number" && (
            <Button size="sm" variant="link" className="h-auto p-0 text-xs"
              onClick={() => { navigate(`/boards/${boardId}`); setOpen(false); }}>
              {t("ai.openResult")}
            </Button>
          )}
        </div>
      )}
      {status === "cancelled" && <p className="text-xs text-muted-foreground">{t("ai.cancelled")}</p>}
      {status === "failed" && (
        <p className="text-xs text-destructive break-words">{t("ai.failed", { error: proposal.error ?? "" })}</p>
      )}
    </div>
  );
}
