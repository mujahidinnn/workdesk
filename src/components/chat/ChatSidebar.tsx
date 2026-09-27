import { useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import {
  Hash,
  FolderKanban,
  MessageCircle,
  SquarePen,
  Search,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/context/auth";
import {
  useChatLastMessages,
  useCreateProjectThread,
  useUnreadMentionCounts,
} from "@/hooks/useChat";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { channelTitle } from "@/lib/chat";
import { AVATAR_CHIP_COLORS } from "@/lib/colorPalettes";
import { cn } from "@/lib/utils";
import type { ChatChannelRow, ChatLastMessage } from "@/hooks/useChat";
import type { UserWithEmail } from "@/lib/types";

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** WhatsApp-style list timestamp: time today, "Yesterday", weekday this week, else a short date. */
function useLastMessageTime() {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();
  return (iso: string) => {
    const date = new Date(iso);
    const days = differenceInCalendarDays(new Date(), date);
    if (days <= 0) return format(date, "HH:mm");
    if (days === 1) return t("chat.yesterday");
    if (days < 7) return format(date, "EEEE", { locale });
    return format(date, "dd/MM/yy");
  };
}

/** Stable color per project name, same hashing idea as UserAvatar - keeps a project's icon badge a consistent color across visits. */
function projectColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % AVATAR_CHIP_COLORS.length;
}

interface ChatSidebarProps {
  channels: ChatChannelRow[];
  activeChannelId: number | null;
  myUserId: string;
  users: UserWithEmail[];
  onSelect: (channelId: number) => void;
  onStartDm: (userId: string) => void;
  sidebarHidden: boolean;
  onToggleSidebar: () => void;
  /** Mobile only: hide the list while a chat is open. */
  mobileHidden?: boolean;
}

export function ChatSidebar({
  channels,
  activeChannelId,
  myUserId,
  users,
  onSelect,
  onStartDm,
  sidebarHidden,
  onToggleSidebar,
  mobileHidden = false,
}: ChatSidebarProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "dm">("all");
  const { data: unread = {} } = useUnreadMentionCounts();
  const { data: lastMessages = {} } = useChatLastMessages();
  const lastMessageTime = useLastMessageTime();
  const unreadFor = (channelId: number) =>
    channelId === activeChannelId ? 0 : (unread[channelId] ?? 0);

  const q = query.trim().toLowerCase();
  const filtering = q !== "" || filter !== "all";
  const matches = (c: ChatChannelRow) =>
    (filter === "unread"
      ? unreadFor(c.id) > 0
      : filter === "dm"
        ? c.type === "dm"
        : true) &&
    (!q ||
      [channelTitle(c, myUserId).name, c.project?.project_name].some((s) =>
        s?.toLowerCase().includes(q),
      ));
  const keptProjects = new Set(
    channels
      .filter((c) => c.type === "project" && matches(c))
      .map((c) => c.project_id),
  );
  // Keep the project's default channel, which renders the group header.
  const visible = channels.filter(
    (c) =>
      matches(c) ||
      (c.type === "project" &&
        c.name == null &&
        keptProjects.has(c.project_id)),
  );

  const general = visible.find((c) => c.type === "general");
  const projectChannels = visible.filter((c) => c.type === "project");
  const dmChannels = visible.filter((c) => c.type === "dm");

  const projectGroups = new Map<number, ChatChannelRow[]>();
  for (const c of projectChannels) {
    if (c.project_id == null) continue;
    const list = projectGroups.get(c.project_id) ?? [];
    list.push(c);
    projectGroups.set(c.project_id, list);
  }
  for (const list of projectGroups.values()) {
    list.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }

  const dmCandidates = users
    .filter((u) => u.id !== myUserId && !u.is_superadmin)
    .filter((u) =>
      (u.full_name ?? u.email).toLowerCase().includes(search.toLowerCase()),
    );

  function previewText(channel: ChatChannelRow, last: ChatLastMessage) {
    const sender =
      last.sender_id === myUserId
        ? t("chat.you")
        : channel.type === "dm"
          ? null
          : last.sender_name?.split(" ")[0];
    const body =
      last.body?.trim() ||
      (last.attachment_count > 0 ? t("chat.attachmentOnly") : "");
    const clip = last.attachment_count > 0 ? "📎 " : "";
    return `${sender ? `${sender}: ` : ""}${clip}${body}`;
  }

  /** Mobile-only title row with time plus a last-message line, like WhatsApp; desktop keeps the compact label. */
  function Label({
    channel,
    text,
    className,
  }: {
    channel: ChatChannelRow;
    text: string;
    className: string;
  }) {
    const last = lastMessages[channel.id];
    return (
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline gap-2">
          <span className={cn("truncate text-sm md:text-xs", className)}>
            {text}
          </span>
          {last && (
            <span className="md:hidden ml-auto flex-shrink-0 text-[11px] text-muted-foreground">
              {lastMessageTime(last.created_at)}
            </span>
          )}
        </span>
        {last && (
          <span className="md:hidden block truncate text-xs text-muted-foreground mt-0.5">
            {previewText(channel, last)}
          </span>
        )}
      </span>
    );
  }

  function Item({
    channel,
    label,
  }: {
    channel: ChatChannelRow;
    label?: string;
  }) {
    const title = channelTitle(channel, myUserId);
    const isActive = channel.id === activeChannelId;
    const Icon =
      channel.type === "general"
        ? Hash
        : channel.type === "project"
          ? Hash
          : MessageCircle;
    return (
      <button
        onClick={() => onSelect(channel.id)}
        className={cn(
          "w-full flex items-center gap-2.5 md:gap-2 px-2.5 py-2 md:py-1.5 rounded-lg text-left transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
        )}
      >
        {channel.type === "dm" ? (
          <UserAvatar
            name={title.name}
            avatarUrl={title.avatarUrl}
            size="xs"
            presenceUserId={title.otherUserId}
          />
        ) : (
          <Icon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
        )}
        <Label
          channel={channel}
          text={label ?? title.name}
          className="font-medium"
        />
        <UnreadBadge count={unreadFor(channel.id)} />
      </button>
    );
  }

  function ProjectGroup({
    projectId,
    group,
  }: {
    projectId: number;
    group: ChatChannelRow[];
  }) {
    const [addOpen, setAddOpen] = useState(false);
    const [threadName, setThreadName] = useState("");
    const createThread = useCreateProjectThread();
    const projectName = group[0]?.project?.project_name ?? "Project";
    const defaultChannel = group.find((c) => c.name == null);
    const threads = group.filter((c) => c.name != null);
    const isDefaultActive = defaultChannel?.id === activeChannelId;

    function submit() {
      const name = threadName.trim();
      if (!name || createThread.isPending) return;
      createThread.mutate(
        { projectId, name },
        {
          onSuccess: () => {
            setThreadName("");
            setAddOpen(false);
          },
        },
      );
    }

    return (
      <div>
        <div className="flex items-center gap-1">
          {defaultChannel && (
            <button
              onClick={() => onSelect(defaultChannel.id)}
              className={cn(
                "flex-1 min-w-0 flex items-center gap-2.5 md:gap-2 px-2 py-2 md:py-1.5 rounded-lg text-left transition-colors",
                isDefaultActive
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <div
                className={cn(
                  "w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0",
                  AVATAR_CHIP_COLORS[projectColorIndex(projectName)],
                )}
              >
                <FolderKanban className="w-3.5 h-3.5" />
              </div>
              <Label
                channel={defaultChannel}
                text={projectName}
                className="font-semibold"
              />
              {defaultChannel && (
                <UnreadBadge count={unreadFor(defaultChannel.id)} />
              )}
            </button>
          )}
          {isAdmin() && (
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <button className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-56 p-2 bg-card border-border"
              >
                <p className="text-[11px] font-medium text-foreground mb-1.5">
                  {t("chat.newThread")}
                </p>
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={threadName}
                    onChange={(e) => setThreadName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder={t("chat.threadNamePlaceholder")}
                    className="flex-1 min-w-0 bg-secondary border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none"
                  />
                  <button
                    onClick={submit}
                    disabled={!threadName.trim() || createThread.isPending}
                    className="px-2 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                  >
                    {t("chat.add")}
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {threads.length > 0 && (
          <div className="space-y-0.5 mt-0.5 pl-5">
            {threads.map((c) => (
              <Item key={c.id} channel={c} label={c.name as string} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "w-full md:w-56 flex-shrink-0 flex-col h-full md:border-r border-border",
        mobileHidden ? "hidden md:flex" : "flex",
      )}
    >
      <div className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleSidebar}
            aria-label={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
            className="hidden md:block p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {sidebarHidden ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
          <p className="text-sm font-semibold text-foreground">
            {t("chat.title")}
          </p>
        </div>
        <Popover open={newDmOpen} onOpenChange={setNewDmOpen}>
          <PopoverTrigger asChild>
            <button className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <SquarePen className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-64 p-0 bg-card border-border"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("chat.findPerson")}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto scrollbar-thin py-1">
              {dmCandidates.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    onStartDm(u.id);
                    setNewDmOpen(false);
                    setSearch("");
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-secondary/60 text-left"
                >
                  <UserAvatar
                    name={u.full_name ?? u.email}
                    avatarUrl={u.avatar_url}
                    size="sm"
                    presenceUserId={u.id}
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{u.full_name ?? u.email}</span>
                    {u.employee_role_title && (
                      <span className="block text-[10px] text-muted-foreground truncate">
                        {u.employee_role_title}
                      </span>
                    )}
                  </span>
                </button>
              ))}
              {dmCandidates.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {t("common.noResults")}
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="px-2.5 pt-3 space-y-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-card dark:bg-secondary border border-border">
          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("chat.searchChannels")}
            aria-label={t("chat.searchChannels")}
            className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "unread", "dm"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                "px-2 py-0.5 rounded-full border text-[11px] transition-colors",
                filter === f
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`chat.filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex-1 px-2.5 py-3 space-y-4 overflow-y-auto scrollbar-thin">
        {filtering && visible.length === 0 && (
          <p className="px-2.5 text-[11px] text-muted-foreground/70">
            {t("common.noResults")}
          </p>
        )}
        {general && (
          <div className="space-y-0.5">
            <Item channel={general} />
          </div>
        )}

        {projectGroups.size > 0 && (
          <div className="space-y-3">
            {[...projectGroups.entries()].map(([projectId, group]) => (
              <ProjectGroup
                key={projectId}
                projectId={projectId}
                group={group}
              />
            ))}
          </div>
        )}

        {(!filtering || dmChannels.length > 0) && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2.5 mb-1.5">
              {t("chat.directMessages")}
            </p>
            <div className="space-y-0.5">
              {dmChannels.map((c) => (
                <Item key={c.id} channel={c} />
              ))}
              {dmChannels.length === 0 && (
                <p className="px-2.5 text-[11px] text-muted-foreground/70">
                  {t("chat.noDms")}
                </p>
              )}
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
}
