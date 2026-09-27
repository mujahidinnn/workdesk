import { useState } from "react";
import { Pin, X, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTogglePinMessage } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

interface PinnedBarProps {
  channelId: number;
  /** False in General for non-admins: they can read pins, not clear them. */
  canPin: boolean;
  /** Newest pin first. */
  messages: ChatMessage[];
}

/** Strip above the message list listing what's pinned in this channel. Collapsed it shows the newest pin, expanded the whole list; clicking one jumps to it. */
export function PinnedBar({ channelId, canPin, messages }: PinnedBarProps) {
  const { t } = useTranslation();
  const togglePin = useTogglePinMessage();
  const [expanded, setExpanded] = useState(false);

  if (messages.length === 0) return null;
  const shown = expanded ? messages : messages.slice(0, 1);

  function jumpTo(messageId: number) {
    document
      .getElementById(`chat-msg-${messageId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="flex-shrink-0 border-b border-border bg-secondary/40 px-3 py-1.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-primary"
        disabled={messages.length === 1}
      >
        <Pin className="w-3 h-3 rotate-45" />
        {t("chat.pinnedCount", { count: messages.length })}
        {messages.length > 1 && (
          <ChevronDown
            className={cn(
              "w-3 h-3 transition-transform",
              expanded && "rotate-180",
            )}
          />
        )}
      </button>

      {shown.map((m) => (
        <div key={m.id} className="flex items-center gap-2 mt-1">
          <button
            onClick={() => jumpTo(m.id)}
            className="min-w-0 flex-1 text-left text-[11px] text-muted-foreground truncate hover:text-foreground"
          >
            <span className="font-medium">
              {m.sender?.full_name ?? "Unknown"}:{" "}
            </span>
            {m.body || t("chat.attachmentOnly")}
          </button>
          {canPin && (
            <button
              onClick={() =>
                togglePin.mutate({ messageId: m.id, channelId, pinned: true })
              }
              className="text-muted-foreground hover:text-foreground flex-shrink-0"
              title={t("chat.unpin")}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
