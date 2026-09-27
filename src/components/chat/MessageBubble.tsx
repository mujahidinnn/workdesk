import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  CornerUpLeft,
  FileText,
  Copy,
  SmilePlus,
  Pin,
  PinOff,
  Pencil,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ForwardPicker } from "./ForwardPicker";
import { EmojiPicker } from "./EmojiPicker";
import { ImageLightbox } from "./ImageLightbox";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { useAuth } from "@/context/auth";
import {
  useDeleteChatMessage,
  useEditChatMessage,
  useToggleReaction,
  useTogglePinMessage,
} from "@/hooks/useChat";
import { isImageAttachment, messageParts } from "@/lib/chat";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: ChatMessage;
  channelId: number;
  isOwn: boolean;
  /** False in General for non-admins: the DB refuses that pin. */
  canPin: boolean;
  memberNames: string[];
  replyToMessage?: ChatMessage | null;
  onReply: (message: ChatMessage) => void;
  onClickSender: (userId: string) => void;
}

export function MessageBubble({
  message,
  channelId,
  isOwn,
  canPin,
  memberNames,
  replyToMessage,
  onReply,
  onClickSender,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const dateFnsLocale = useDateFnsLocale();
  const toggleReaction = useToggleReaction();
  const togglePin = useTogglePinMessage();
  const editMessage = useEditChatMessage();
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const deleteMessage = useDeleteChatMessage();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const senderName = message.sender?.full_name ?? "Unknown";
  const parts = messageParts(message.body, memberNames);
  const firstLink = parts.find((p) => p.kind === "link")?.href;
  const attachments = message.attachments ?? [];
  const imageAttachments = attachments.filter(isImageAttachment);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const reactionGroups = useMemo(() => {
    const map = new Map<
      string,
      { emoji: string; count: number; reactedByMe: boolean }
    >();
    for (const r of message.reactions ?? []) {
      const g = map.get(r.emoji) ?? {
        emoji: r.emoji,
        count: 0,
        reactedByMe: false,
      };
      g.count += 1;
      if (r.user_id === user?.id) g.reactedByMe = true;
      map.set(r.emoji, g);
    }
    return [...map.values()];
  }, [message.reactions, user?.id]);

  function toggle(emoji: string, reacted: boolean) {
    toggleReaction.mutate({ messageId: message.id, channelId, emoji, reacted });
  }

  function saveEdit() {
    const body = (editDraft ?? "").trim();
    if (!body || body === message.body) return setEditDraft(null);
    editMessage.mutate(
      { messageId: message.id, channelId, body },
      {
        onSuccess: () => setEditDraft(null),
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  function copyMessage() {
    navigator.clipboard.writeText(message.body).then(
      () => toast.success(t("chat.copied")),
      () => toast.error(t("chat.copyFailed")),
    );
  }

  return (
    <div
      id={`chat-msg-${message.id}`}
      className={cn(
        "group relative flex gap-2.5 px-1 py-1.5 hover:bg-secondary/40 rounded-lg -mx-1 scroll-mt-4",
        isOwn && "flex-row-reverse text-right",
      )}
    >
      <button
        onClick={() => onClickSender(message.sender_id)}
        className="flex-shrink-0"
      >
        <UserAvatar
          name={senderName}
          avatarUrl={message.sender?.avatar_url}
          size="md"
        />
      </button>

      <div
        className={cn(
          "min-w-0 max-w-[75%]",
          isOwn && "flex flex-col items-end",
        )}
      >
        <div
          className={cn(
            "flex items-baseline gap-2",
            isOwn && "flex-row-reverse",
          )}
        >
          <button
            onClick={() => onClickSender(message.sender_id)}
            className="text-xs font-semibold text-foreground hover:underline"
          >
            {senderName}
          </button>
          <span className="text-[10px] text-muted-foreground/70">
            {formatDistanceToNow(new Date(message.created_at), {
              addSuffix: true,
              locale: dateFnsLocale,
            })}
          </span>
          {message.edited_at && (
            <span className="text-[10px] text-muted-foreground/70">
              {t("chat.edited")}
            </span>
          )}
          {message.pinned_at && (
            <Pin className="w-3 h-3 text-primary rotate-45" />
          )}
        </div>

        {replyToMessage && (
          <div className="mt-1 mb-1 pl-2 border-l-2 border-border text-[11px] text-muted-foreground line-clamp-2 max-w-full">
            <span className="font-medium">
              {replyToMessage.sender?.full_name ?? "Unknown"}:{" "}
            </span>
            {replyToMessage.body}
          </div>
        )}

        {message.forwarded_from_sender_name && (
          <p className="text-[11px] text-muted-foreground italic mt-0.5">
            {t("chat.forwardedFrom", {
              name: message.forwarded_from_sender_name,
            })}
          </p>
        )}

        {editDraft !== null ? (
          <div className="mt-1 w-full min-w-[200px] text-left">
            <Textarea
              autoFocus
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditDraft(null);
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
              }}
              rows={1}
              className="bg-secondary border-border text-foreground text-xs resize-none min-h-8 max-h-32"
            />
            <div className="flex gap-1.5 mt-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px] px-2 text-primary hover:text-primary"
                onClick={saveEdit}
                disabled={editMessage.isPending}
              >
                {t("common.save")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px] px-2 text-muted-foreground"
                onClick={() => setEditDraft(null)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : message.body ? (
          <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap break-words">
            {parts.map((p, i) => {
              if (p.kind === "mention") {
                return (
                  <span
                    key={i}
                    className="font-medium text-primary bg-primary/10 rounded px-0.5"
                  >
                    {p.text}
                  </span>
                );
              }
              if (p.kind === "link") {
                return (
                  <a
                    key={i}
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary underline-offset-2 hover:underline hover:text-primary/80 break-all"
                  >
                    {p.text}
                  </a>
                );
              }
              return <span key={i}>{p.text}</span>;
            })}
          </p>
        ) : null}

        {firstLink && <LinkPreviewCard url={firstLink} />}

        {attachments.length > 0 && (
          <div
            className={cn(
              "flex flex-wrap gap-1.5 mt-1.5",
              isOwn && "justify-end",
            )}
          >
            {attachments.map((a) =>
              a.url && a.file_type?.startsWith("video/") ? (
                <video
                  key={a.id}
                  src={a.url}
                  controls
                  preload="metadata"
                  className="max-w-[280px] max-h-[220px] rounded-lg border border-border"
                />
              ) : a.url && a.file_type?.startsWith("audio/") ? (
                <audio
                  key={a.id}
                  src={a.url}
                  controls
                  preload="metadata"
                  className="max-w-[260px] h-10"
                />
              ) : isImageAttachment(a) && a.url ? (
                <button
                  key={a.id}
                  onClick={() =>
                    setLightboxIndex(
                      imageAttachments.findIndex((img) => img.id === a.id),
                    )
                  }
                  className="block"
                >
                  <img
                    src={a.url}
                    alt={a.file_name}
                    loading="lazy"
                    decoding="async"
                    className="max-w-[220px] max-h-[220px] rounded-lg border border-border object-cover"
                  />
                </button>
              ) : (
                <a
                  key={a.id}
                  href={a.url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-secondary/60 text-xs text-foreground hover:bg-secondary max-w-[220px]"
                >
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{a.file_name}</span>
                </a>
              ),
            )}
          </div>
        )}

        {lightboxIndex != null && (
          <ImageLightbox
            message={message}
            channelId={channelId}
            index={lightboxIndex}
            onIndexChange={setLightboxIndex}
            open={lightboxIndex != null}
            onOpenChange={(v) => !v && setLightboxIndex(null)}
          />
        )}

        {reactionGroups.length > 0 && (
          <div
            className={cn(
              "flex flex-wrap gap-1 mt-1.5",
              isOwn && "justify-end",
            )}
          >
            {reactionGroups.map((g) => (
              <button
                key={g.emoji}
                onClick={() => toggle(g.emoji, g.reactedByMe)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] leading-none transition-colors",
                  g.reactedByMe
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-secondary/60 border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                <span>{g.emoji}</span>
                <span>{g.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className={cn(
          "flex items-center gap-0.5 flex-shrink-0 self-start opacity-0 group-hover:opacity-100 transition-opacity",
          "absolute -top-2 z-10 rounded-md border bg-background shadow-sm sm:static sm:border-0 sm:bg-transparent sm:shadow-none",
          isOwn ? "left-1" : "right-1",
        )}
      >
        <EmojiPicker
          align="center"
          tooltip={t("chat.react")}
          onPick={(emoji) => toggle(emoji, false)}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
            >
              <SmilePlus className="w-3.5 h-3.5" />
            </Button>
          }
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onReply(message)}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
            >
              <CornerUpLeft className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{t("chat.reply")}</TooltipContent>
        </Tooltip>
        <ForwardPicker message={message} />
        {canPin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  togglePin.mutate({
                    messageId: message.id,
                    channelId,
                    pinned: !!message.pinned_at,
                  })
                }
                className={cn(
                  "h-6 w-6 hover:text-foreground",
                  message.pinned_at ? "text-primary" : "text-muted-foreground",
                )}
              >
                {message.pinned_at ? (
                  <PinOff className="w-3.5 h-3.5 rotate-45" />
                ) : (
                  <Pin className="w-3.5 h-3.5 rotate-45" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {message.pinned_at ? t("chat.unpin") : t("chat.pin")}
            </TooltipContent>
          </Tooltip>
        )}
        {isOwn && message.body && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditDraft(message.body)}
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("common.edit")}</TooltipContent>
          </Tooltip>
        )}
        {isOwn && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmDelete(true)}
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("common.delete")}</TooltipContent>
          </Tooltip>
        )}
        {message.body && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={copyMessage}
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("chat.copy")}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <DeleteConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        isPending={deleteMessage.isPending}
        onConfirm={() =>
          deleteMessage.mutate(
            { messageId: message.id, channelId },
            {
              onSuccess: () => setConfirmDelete(false),
              onError: (e: Error) => toast.error(e.message),
            },
          )
        }
        title={t("chat.deleteConfirm.title")}
        description={t("chat.deleteConfirm.body")}
      />
    </div>
  );
}
