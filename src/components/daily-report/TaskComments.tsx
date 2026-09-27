import { useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  useTaskComments,
  useAddTaskComment,
  useDeleteTaskComment,
} from "@/hooks/useTaskComments";
import { useUsers } from "@/hooks/useUsers";
import { useAuth } from "@/context/auth";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { messageParts } from "@/lib/chat";
import { cn } from "@/lib/utils";
import type { UserWithEmail } from "@/lib/types";

interface TaskCommentsProps {
  taskId: number;
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const { t } = useTranslation();
  const dateFnsLocale = useDateFnsLocale();
  const { user, isAdmin } = useAuth();
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const addComment = useAddTaskComment();
  const deleteComment = useDeleteTaskComment();
  const [value, setValue] = useState("");
  const { data: allUsers = [] } = useUsers();
  const people = useMemo(
    () => allUsers.filter((u) => !u.is_superadmin),
    [allUsers],
  );
  const peopleNames = useMemo(
    () => people.map((u) => u.full_name ?? u.email),
    [people],
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());

  const mentionMatches =
    mentionQuery === null
      ? []
      : people
          .filter((u) =>
            (u.full_name ?? u.email)
              .toLowerCase()
              .includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 6);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    const uptoCaret = next.slice(0, e.target.selectionStart);
    const at = uptoCaret.lastIndexOf("@");
    setValue(next);
    setMentionQuery(
      at === -1 || /\s/.test(uptoCaret.slice(at + 1))
        ? null
        : uptoCaret.slice(at + 1),
    );
    setHighlightIndex(0);
  }

  function pickMention(u: UserWithEmail) {
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const at = value.slice(0, caret).lastIndexOf("@");
    if (at === -1) return;
    setValue(
      `${value.slice(0, at)}@${u.full_name ?? u.email} ${value.slice(caret)}`,
    );
    setMentionedIds((prev) => new Set(prev).add(u.id));
    setMentionQuery(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function handleSend() {
    const comment = value.trim();
    if (!comment) return;
    // Only keep mentions whose "@Name" is still in the text.
    const mentions = people
      .filter(
        (u) =>
          mentionedIds.has(u.id) &&
          comment.includes(`@${u.full_name ?? u.email}`),
      )
      .map((u) => u.id);
    addComment.mutate(
      { taskId, comment, mentions },
      {
        onSuccess: () => {
          setValue("");
          setMentionedIds(new Set());
        },
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setHighlightIndex(
          (i) => (i + step + mentionMatches.length) % mentionMatches.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(
          mentionMatches[Math.min(highlightIndex, mentionMatches.length - 1)],
        );
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col gap-2.5 pt-2">
      {isLoading ? (
        <div className="h-8 rounded-lg bg-secondary animate-pulse" />
      ) : comments.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60 text-center py-2">
          {t("issues.noComments")}
        </p>
      ) : (
        comments.map((c) => (
          <div key={c.id} className="flex items-start gap-2 group">
            <UserAvatar
              name={c.author?.full_name ?? "?"}
              avatarUrl={c.author?.avatar_url}
              size="xs"
            />
            <div className="flex-1 min-w-0 bg-secondary/50 rounded-lg px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-foreground">
                  {c.author?.full_name ?? "-"}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at), {
                    addSuffix: true,
                    locale: dateFnsLocale,
                  })}
                </span>
              </div>
              <p className="text-xs text-foreground/90 leading-snug break-words whitespace-pre-wrap">
                {messageParts(c.comment, peopleNames, false).map((p, i) =>
                  p.kind === "mention" ? (
                    <span
                      key={i}
                      className="font-medium text-primary bg-primary/10 rounded px-0.5"
                    >
                      {p.text}
                    </span>
                  ) : p.kind === "link" ? (
                    <a
                      key={i}
                      href={p.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 break-all"
                    >
                      {p.text}
                    </a>
                  ) : (
                    <span key={i}>{p.text}</span>
                  ),
                )}
              </p>
            </div>
            {(c.user_id === user?.id || isAdmin()) && (
              <button
                onClick={() => deleteComment.mutate({ id: c.id, taskId })}
                title={t("issues.deleteComment")}
                className="p-1 rounded text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))
      )}

      <div className="relative flex items-end gap-2 pt-1">
        {mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1.5 w-64 max-h-48 overflow-y-auto scrollbar-thin bg-card border border-border rounded-lg shadow-xl py-1 z-20">
            {mentionMatches.map((u, i) => (
              <button
                key={u.id}
                type="button"
                onMouseEnter={() => setHighlightIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickMention(u);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground text-left",
                  i === highlightIndex
                    ? "bg-secondary/60"
                    : "hover:bg-secondary/60",
                )}
              >
                <UserAvatar
                  name={u.full_name ?? u.email}
                  avatarUrl={u.avatar_url}
                  size="xs"
                />
                {u.full_name ?? u.email}
                {u.employee_role_title && (
                  <span className="text-[10px] text-muted-foreground truncate">
                    {u.employee_role_title}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={t("issues.commentPlaceholder")}
          rows={1}
          className="min-h-[32px] text-xs bg-secondary border-border resize-none py-1.5"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!value.trim() || addComment.isPending}
          className="h-8 w-8 p-0 flex-shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
