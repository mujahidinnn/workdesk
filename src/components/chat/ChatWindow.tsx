import { useEffect, useMemo, useRef, useState } from "react";
import { endOfDay, format, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  ArrowDown,
  ArrowLeft,
  CalendarIcon,
  Hash,
  FolderKanban,
  MessageCircle,
  Search,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import { PinnedBar } from "./PinnedBar";
import { useAuth } from "@/context/auth";
import {
  useChatMessages,
  useMarkChannelRead,
  useSearchChatMessages,
} from "@/hooks/useChat";
import { channelTitle } from "@/lib/chat";
import { useJobTitles } from "@/hooks/useJobTitles";
import { cn } from "@/lib/utils";
import type { ChatChannelRow } from "@/hooks/useChat";
import type { ChatMessage, UserWithEmail } from "@/lib/types";

const MESSAGE_FILTERS = ["all", "attachments", "pinned", "mine"] as const;
type MessageFilter = (typeof MESSAGE_FILTERS)[number];

interface ChatWindowProps {
  channel: ChatChannelRow;
  members: UserWithEmail[];
  onClickSender: (userId: string) => void;
  /** Mobile only: back to the channel list. */
  onBack: () => void;
  mobileHidden?: boolean;
}

export function ChatWindow({
  channel,
  members,
  onClickSender,
  onBack,
  mobileHidden = false,
}: ChatWindowProps) {
  const { t } = useTranslation();
  const jobTitles = useJobTitles();
  const { user, isAdmin } = useAuth();
  const { data: messages = [], isLoading } = useChatMessages(channel.id);
  // A pin in General is an announcement; mirrors the DB guard's admin-only rule.
  const canPin = channel.type !== "general" || isAdmin();
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { mutate: markRead } = useMarkChannelRead();

  // ponytail: stamped with the client clock; a badly skewed clock could leave
  // one message counted unread, upgrade to a server-side now() RPC if it matters.
  useEffect(() => {
    markRead(channel.id);
  }, [channel.id, messages.length, markRead]);

  // Don't yank a reader scrolled into history down to new messages.
  const atBottomRef = useRef(true);
  const lastChannelRef = useRef(channel.id);
  const lastSenderId = messages[messages.length - 1]?.sender_id;
  useEffect(() => {
    if (lastChannelRef.current !== channel.id) {
      lastChannelRef.current = channel.id;
      atBottomRef.current = true;
    }
    if (atBottomRef.current || lastSenderId === user?.id) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [channel.id, messages.length, lastSenderId, user?.id]);

  const [farFromBottom, setFarFromBottom] = useState(false);
  const onScroll = (e: React.UIEvent<HTMLElement>) => {
    const el = e.target as HTMLElement;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance < 150;
    setFarFromBottom(distance > el.clientHeight * 5);
  };
  useEffect(() => setFarFromBottom(false), [channel.id]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MessageFilter>("all");
  const [range, setRange] = useState<DateRange | undefined>();

  useEffect(() => {
    setReplyTo(null);
    setQuery("");
    setFilter("all");
    setRange(undefined);
  }, [channel.id]);

  const [text, setText] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setText(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);
  const filtering = text !== "" || filter !== "all" || !!range?.from;
  const search = filtering
    ? {
        text,
        filter,
        from: range?.from ? startOfDay(range.from).toISOString() : null,
        to: range?.from ? endOfDay(range.to ?? range.from).toISOString() : null,
      }
    : null;
  const { data: results = [], isFetching: searching } = useSearchChatMessages(
    channel.id,
    search,
  );
  const visibleMessages = filtering ? results : messages;

  const messagesById = useMemo(() => {
    const map = new Map<number, ChatMessage>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  // ponytail: pins are read off the 200 messages already loaded, so a pin on
  // an older message won't show - give pins their own query if channels get
  // that long.
  const pinnedMessages = useMemo(
    () =>
      messages
        .filter((m) => m.pinned_at)
        .sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? "")),
    [messages],
  );

  const memberNames = useMemo(
    () => members.map((m) => m.full_name ?? m.email),
    [members],
  );

  const title = channelTitle(channel, user?.id ?? "");
  const subtitle = title.subtitle || jobTitles.byUser(title.otherUserId);
  const Icon =
    channel.type === "general"
      ? Hash
      : channel.type === "project"
        ? FolderKanban
        : MessageCircle;

  return (
    <div
      className={cn(
        "flex-1 flex-col h-full min-w-0",
        mobileHidden ? "hidden md:flex" : "flex",
      )}
    >
      <div className="min-h-14 py-2 flex-shrink-0 flex flex-wrap items-center gap-2.5 px-4 border-b border-border">
        <button
          onClick={onBack}
          aria-label={t("errors.forbidden.goBack")}
          className="md:hidden -ml-1 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {channel.type === "dm" ? (
          <UserAvatar
            name={title.name}
            avatarUrl={title.avatarUrl}
            size="sm"
            presenceUserId={title.otherUserId}
          />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {title.name}
          </p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
        <div className="w-full md:w-auto md:ml-auto flex items-center gap-2">
          <div className="flex-1 md:flex-none flex items-center gap-2 px-2.5 h-8 rounded-md bg-card dark:bg-secondary border border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("chat.searchMessages")}
              aria-label={t("chat.searchMessages")}
              className="w-full md:w-36 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                aria-label={t("common.pickDate")}
                className={cn(
                  "h-8 px-2.5 text-xs font-normal border-border bg-secondary hover:bg-secondary/80",
                  !range?.from && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">
                  {range?.from
                    ? range.to && range.to.getTime() !== range.from.getTime()
                      ? `${format(range.from, "dd MMM")} - ${format(range.to, "dd MMM yyyy")}`
                      : format(range.from, "dd MMM yyyy")
                    : t("common.pickDate")}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-auto p-0 bg-card border-border"
            >
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                initialFocus
                className="text-foreground"
              />
              {range?.from && (
                <div className="px-3 pb-2">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setRange(undefined)}
                  >
                    {t("common.clearDate")}
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as MessageFilter)}
          >
            <SelectTrigger className="w-[110px] md:w-[130px] h-8 bg-secondary border-border text-foreground text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {MESSAGE_FILTERS.map((f) => (
                <SelectItem key={f} value={f} className="text-xs">
                  {t(`chat.filter.${f}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <PinnedBar
        channelId={channel.id}
        canPin={canPin}
        messages={pinnedMessages}
      />

      <div className="relative flex-1 min-h-0 flex flex-col">
      {/* Scroll doesn't bubble, so catch the viewport's scroll in capture phase. */}
      <ScrollArea className="flex-1 min-h-0" onScrollCapture={onScroll}>
        <div className="px-3 py-3">
          {!isLoading && messages.length === 0 && (
            <EmptyState
              size="sm"
              icon={MessageCircle}
              title={t("chat.empty")}
              description={t("chat.emptyHint")}
            />
          )}
          {filtering && !searching && visibleMessages.length === 0 && (
            <EmptyState size="sm" icon={Search} title={t("common.noResults")} />
          )}
          {visibleMessages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              channelId={channel.id}
              isOwn={m.sender_id === user?.id}
              canPin={canPin}
              memberNames={memberNames}
              replyToMessage={
                m.reply_to_id ? messagesById.get(m.reply_to_id) : null
              }
              onReply={setReplyTo}
              onClickSender={onClickSender}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      {farFromBottom && (
        <button
          type="button"
          onClick={() =>
            bottomRef.current?.scrollIntoView({
              block: "end",
              behavior: "smooth",
            })
          }
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
        >
          {t("chat.jumpToPresent")}
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      )}
      </div>

      <MessageComposer
        channelId={channel.id}
        members={members}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}
