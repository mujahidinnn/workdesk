import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { History, Loader2, MessageSquare, Plus, Send, Sparkles, Square, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { cn } from "@/lib/utils";
import { useAiPanel } from "@/components/ai/AiProvider";
import { ProposalCard } from "@/components/ai/ProposalCard";
import {
  useAiConversations, useAiMessages, useAiMode, useAiQuota, useDeleteAiConversation, useExecuteProposal,
  type AiConversation, type AiMessage, type AiRequestError,
} from "@/hooks/useAi";
import { cardModes, getTool, isSafePath } from "../../../supabase/functions/_shared/aiCatalog.ts";
import { parseAiText, type AiSpan } from "@/lib/aiText";

const COUNTDOWN_MS = 5000;
const USER_BUBBLE =
  "ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary/15 px-3 py-2 text-sm";

function Spans({ spans }: { spans: AiSpan[] }) {
  return <>{spans.map((s, i) => (s.bold ? <strong key={i} className="font-semibold">{s.text}</strong> : s.text))}</>;
}

function AiText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 break-words leading-relaxed">
      {parseAiText(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}><Spans spans={b.spans} /></p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-0.5 pl-5 marker:text-muted-foreground">
            {b.items.map((it, j) => <li key={j}><Spans spans={it} /></li>)}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-0.5 pl-6 marker:text-muted-foreground">
            {b.items.map((it, j) => <li key={j}><Spans spans={it} /></li>)}
          </ol>
        ),
      )}
    </div>
  );
}

/** Mounted once in the shell, so countdowns keep running when the panel is closed or the page changes. */
export function CommandPanel() {
  return (
    <>
      <CountdownRunner />
      <PanelSheet />
    </>
  );
}

function CountdownRunner() {
  const { conversationId, scheduler, arrived } = useAiPanel();
  const { data: messages } = useAiMessages(conversationId);
  const { mode } = useAiMode();
  const { mutate } = useExecuteProposal();
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  // An id is armed once; a later render must not arm it again after it fired or was undone.
  const armed = useRef(new Set<string>());

  useEffect(() => {
    for (const m of messages ?? []) {
      if (m.role !== "assistant") continue;
      const modes = cardModes(m.content.proposals, mode);
      m.content.proposals.forEach((p, i) => {
        if (p.status !== "pending") return;
        if (modes[i] !== "countdown") return scheduler.cancel(p.id);
        if (!arrived.has(p.id) || armed.current.has(p.id)) return;
        armed.current.add(p.id);
        scheduler.start(p.id, COUNTDOWN_MS, () => mutateRef.current({ messageId: m.id, proposal: p }));
      });
    }
  }, [messages, mode, scheduler, arrived]);

  return null;
}

function PanelSheet() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    open, setOpen, draft, setDraft, conversationId, setConversationId, showHistory, setShowHistory,
    send, stop, sending, sentText, sendError, scheduler,
  } = useAiPanel();
  const { data: messages = [] } = useAiMessages(conversationId);
  const { data: conversations = [] } = useAiConversations();
  const { data: quota } = useAiQuota();
  const { mode, setMode } = useAiMode();
  const execute = useExecuteProposal();
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const off = sendError?.code === "not_configured";

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sending, open, showHistory]);

  const openConversation = (id: number | null) => {
    setConversationId(id);
    setShowHistory(false);
  };

  useEffect(() => {
    if (open && !sending) input.current?.focus();
  }, [sending, open]);

  const submit = () => {
    if (!draft.trim() || sending || off) return;
    setShowHistory(false);
    void send(draft);
  };

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const runAll = async (m: Extract<AiMessage, { role: "assistant" }>) => {
    for (const p of m.content.proposals) {
      if (p.status !== "pending") continue;
      scheduler.cancel(p.id);
      await execute.mutateAsync({ messageId: m.id, proposal: p }).catch(() => undefined);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus(); }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 pr-10">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <SheetTitle className="text-sm">{t("ai.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("ai.description")}</SheetDescription>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            {t("ai.autoMode")}
            <Switch checked={mode === "auto"} onCheckedChange={(v) => setMode.mutate(v ? "auto" : "ask")} />
          </label>
          <Button size="icon" variant="ghost" className="h-7 w-7" title={t("ai.newConversation")}
            aria-label={t("ai.newConversation")} onClick={() => openConversation(null)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" title={t("ai.history")} aria-label={t("ai.history")}
            aria-pressed={showHistory} onClick={() => setShowHistory(!showHistory)}
            className={cn("h-7 w-7", showHistory && "bg-primary/15 text-primary hover:bg-primary/20")}>
            <History className="h-4 w-4" />
          </Button>
          {quota && <span className="text-xs tabular-nums text-muted-foreground">{quota.used}/{quota.limit}</span>}
        </div>

        {showHistory ? (
          <HistoryList conversations={conversations} activeId={conversationId} onOpen={openConversation} />
        ) : (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 && !sentText && (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("ai.empty")}</p>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className={USER_BUBBLE}>
                {m.content.text}
              </div>
            ) : (
              <div key={m.id} className="mr-4 flex flex-col gap-2 text-sm">
                {m.content.text && <AiText text={m.content.text} />}
                <Proposals m={m} mode={mode} onRunAll={() => runAll(m)} busy={execute.isPending} />
                {m.content.choices.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {m.content.choices.map((c) => (
                      <Button key={c.label} size="sm" variant="outline" disabled={sending}
                        onClick={() => void send(c.reply)}>{c.label}</Button>
                    ))}
                  </div>
                )}
                {m.content.links.filter((l) => isSafePath(l.path)).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {m.content.links.filter((l) => isSafePath(l.path)).map((l) => (
                      <Button key={l.path + l.label} size="sm" variant="secondary" onClick={() => go(l.path)}>
                        {l.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          {sentText && (
            <div className={USER_BUBBLE}>{sentText}</div>
          )}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("ai.thinking")}
              <Button size="sm" variant="outline" className="ml-auto h-7" onClick={stop}>
                <Square className="mr-1 h-3 w-3" />{t("ai.stop")}
              </Button>
            </div>
          )}
          {sendError && !sending && <ErrorNote error={sendError} />}
          <div ref={bottom} />
        </div>
        )}

        <div className="border-t border-border px-4 py-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={input}
              rows={2}
              value={draft}
              disabled={off}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={off ? t("ai.notConfigured") : t("ai.placeholder")}
              className="min-h-0 resize-none text-sm"
            />
            <Button size="icon" onClick={submit} disabled={off || sending || !draft.trim()} aria-label={t("ai.send")}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{t("ai.retentionNote")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Proposals({ m, mode, onRunAll, busy }: {
  m: Extract<AiMessage, { role: "assistant" }>;
  mode: "ask" | "auto";
  onRunAll: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const ps = m.content.proposals;
  if (ps.length === 0) return null;
  const modes = cardModes(ps, mode);
  const batchCritical = ps.filter((p) => getTool(p.tool)?.tier === "write").length > 5;
  const pending = ps.filter((p) => p.status === "pending").length;
  return (
    <div className="flex flex-col gap-2">
      {batchCritical && pending > 1 && (
        <Button size="sm" disabled={busy} onClick={onRunAll}>{t("ai.runAll", { count: pending })}</Button>
      )}
      {ps.map((p, i) => (
        <ProposalCard key={p.id} messageId={m.id} proposal={p} mode={modes[i]} batchCritical={batchCritical} />
      ))}
    </div>
  );
}

function ErrorNote({ error }: { error: AiRequestError }) {
  const { t } = useTranslation();
  const known = ["invalid", "too_long", "quota", "not_configured", "model_busy", "blocked", "timeout", "aborted"];
  const code = known.includes(error.code) ? error.code : "unknown";
  return (
    <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {t(`ai.error.${code}`, { limit: error.info.limit })}
    </p>
  );
}

function HistoryList({ conversations, activeId, onOpen }: {
  conversations: AiConversation[];
  activeId: number | null;
  onOpen: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();
  const remove = useDeleteAiConversation();
  const [target, setTarget] = useState<AiConversation | null>(null);

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2">
      <p className="px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("ai.history")}
      </p>
      {conversations.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("ai.noHistory")}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {conversations.map((c) => (
            <li key={c.id} className="group relative">
              <button type="button" onClick={() => onOpen(c.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 pr-9 text-left text-sm transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  c.id === activeId && "bg-primary/10",
                )}>
                <MessageSquare className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground", c.id === activeId && "text-primary")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.title || t("ai.untitled")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale })}
                  </span>
                </span>
              </button>
              <Button size="icon" variant="ghost" aria-label={t("ai.deleteConversation")}
                onClick={() => setTarget(c)}
                className="absolute right-1 top-1.5 h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <DeleteConfirmationModal
        open={!!target}
        onOpenChange={(v) => { if (!v) setTarget(null); }}
        title={t("ai.deleteConversation")}
        description={t("ai.deleteConversationDesc", { title: target?.title || t("ai.untitled") })}
        isPending={remove.isPending}
        onConfirm={() => {
          if (!target) return;
          remove.mutate(target.id, {
            onSuccess: () => { if (target.id === activeId) onOpen(null); setTarget(null); },
          });
        }}
      />
    </div>
  );
}
