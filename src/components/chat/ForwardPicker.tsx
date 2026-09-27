import { useState } from "react";
import { Forward, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/context/auth";
import { useChatChannels, useForwardMessage } from "@/hooks/useChat";
import { channelTitle } from "@/lib/chat";
import { useJobTitles } from "@/hooks/useJobTitles";
import { toast } from "sonner";
import type { ChatMessage } from "@/lib/types";

interface ForwardPickerProps {
  message: ChatMessage;
}

export function ForwardPicker({ message }: ForwardPickerProps) {
  const { t } = useTranslation();
  const jobTitles = useJobTitles();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: channels = [] } = useChatChannels();
  const forward = useForwardMessage();

  const myId = user?.id ?? "";
  const targets = channels
    .map((c) => ({ channel: c, title: channelTitle(c, myId) }))
    .filter((t) => t.title.name.toLowerCase().includes(search.toLowerCase()));

  function pick(channelId: number) {
    forward.mutate(
      { message, toChannelId: channelId },
      {
        onSuccess: () => {
          toast.success(t("chat.forwarded"));
          setOpen(false);
          setSearch("");
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
            >
              <Forward className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("chat.forward")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-64 p-0 bg-card border-border">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("chat.forwardTo")}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
        <div className="max-h-64 overflow-y-auto scrollbar-thin py-1">
          {targets.map(({ channel, title }) => (
            <button
              key={channel.id}
              onClick={() => pick(channel.id)}
              disabled={forward.isPending}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-secondary/60 text-left disabled:opacity-50"
            >
              {channel.type === "dm" ? (
                <UserAvatar
                  name={title.name}
                  avatarUrl={title.avatarUrl}
                  size="sm"
                />
              ) : (
                <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
                  #
                </span>
              )}
              <span className="truncate">{title.name}</span>
              {jobTitles.byUser(title.otherUserId) && (
                <span className="text-[10px] text-muted-foreground truncate">
                  {jobTitles.byUser(title.otherUserId)}
                </span>
              )}
            </button>
          ))}
          {targets.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {t("common.noResults")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
