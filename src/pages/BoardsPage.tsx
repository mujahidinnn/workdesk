import { useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, CheckCircle2, CircleDot, ExternalLink, ImageIcon, Info, MoreHorizontal, SquareKanban } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SearchInput } from "@/components/master-hub/MasterSection";
import { projectDetailFields } from "@/components/master-hub/projectDetail";
import { DetailDialog } from "@/components/ui/DetailDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BoardBanner } from "@/components/board/BoardBanner";
import { BannerPicker } from "@/components/board/BannerPicker";
import { useAuth } from "@/context/auth";
import { useSetBanner } from "@/hooks/useBoard";
import {
  useBannerUrls,
  useBoardOrder,
  useBoardStats,
  useEnsureBoard,
  useMyProjectRoles,
  useProjectMembers,
  useSaveBoardOrder,
  type BoardCardStats,
} from "@/hooks/useBoards";
import { useProjects } from "@/hooks/useProjects";
import { CLOSED_PROJECT_STATUSES, type Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_BANNER = 5 * 1024 * 1024;

function Stat({ n, icon, tone, children }: { n: number; icon: ReactNode; tone: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1", n > 0 ? tone : "text-muted-foreground opacity-50")}>
      {icon}
      {children}
    </span>
  );
}

function BoardCard({
  project,
  stats,
  bannerUrl,
  canBanner,
  canMaster,
  onOpen,
  onDetail,
  onBanner,
}: {
  project: Project;
  stats?: BoardCardStats;
  bannerUrl?: string;
  canBanner: boolean;
  canMaster: boolean;
  onOpen: () => void;
  onDetail: () => void;
  onBanner: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card text-left outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "z-10 opacity-60 shadow-lg",
      )}
      {...attributes}
      {...listeners}
      role="link"
      aria-label={project.project_name}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter") onOpen();
        else listeners?.onKeyDown?.(e);
      }}
    >
      <BoardBanner background={stats?.background} url={bannerUrl} seed={project.id} className="h-20 w-full" />
      <div
        className="absolute right-2 top-2"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded-md bg-black/40 p-1 text-white backdrop-blur hover:bg-black/60"
            aria-label={t("board.boards.menu")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onDetail}>
              <Info className="mr-2 h-4 w-4" />
              {t("board.boards.detail")}
            </DropdownMenuItem>
            {canBanner && (
              <DropdownMenuItem onClick={onBanner}>
                <ImageIcon className="mr-2 h-4 w-4" />
                {t("board.banner.change")}
              </DropdownMenuItem>
            )}
            {canMaster && (
              <DropdownMenuItem onClick={() => navigate(`/master?tab=projects&project=${project.id}`)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("board.boards.openMaster")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{project.project_code}</p>
          <p className="font-semibold text-foreground">{project.project_name}</p>
          <p className="text-xs text-muted-foreground">{project.client}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <Stat n={stats?.open ?? 0} tone="text-foreground" icon={<CircleDot className="h-3.5 w-3.5" />}>
            {t("board.boards.open", { count: stats?.open ?? 0 })}
          </Stat>
          <Stat n={stats?.overdue ?? 0} tone="text-red-500" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
            {t("board.boards.overdue", { count: stats?.overdue ?? 0 })}
          </Stat>
          <Stat n={stats?.done ?? 0} tone="text-emerald-600 dark:text-emerald-400" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            {t("board.boards.done", { count: stats?.done ?? 0 })}
          </Stat>
        </div>
      </div>
    </div>
  );
}

export default function BoardsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAdmin, canUpdate } = useAuth();
  const { data: projects = [], isLoading } = useProjects();
  const { data: stats = {} } = useBoardStats();
  const { data: order = {} } = useBoardOrder();
  const { data: roles = {} } = useMyProjectRoles();
  const { data: banners = {} } = useBannerUrls(Object.values(stats).map((s) => s.background));
  const saveOrder = useSaveBoardOrder();
  const ensure = useEnsureBoard();
  const setBanner = useSetBanner();
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Project | null>(null);
  const [bannerFor, setBannerFor] = useState<Project | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: members = [] } = useProjectMembers(detail?.id ?? null);

  const mine = useMemo(() => {
    const at = (p: Project) => order[p.id] ?? Number.MAX_SAFE_INTEGER;
    return projects
      .filter((p) => isAdmin() || p.member_user_ids?.includes(user?.id ?? ""))
      .filter((p) => !CLOSED_PROJECT_STATUSES.includes(p.work_status?.status_name ?? ""))
      .sort((a, b) => at(a) - at(b));
  }, [projects, isAdmin, user?.id, order]);
  const shown = mine.filter((p) => `${p.project_code} ${p.project_name} ${p.client}`.toLowerCase().includes(q.toLowerCase()));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = mine.map((p) => p.id);
    saveOrder.mutate(arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id))));
  }

  async function boardIdOf(projectId: number) {
    return stats[projectId]?.board_id ?? (await ensure.mutateAsync(projectId)).id;
  }

  function open(projectId: number) {
    const known = stats[projectId]?.board_id;
    if (known) return navigate(`/boards/${known}`);
    ensure.mutate(projectId, { onSuccess: (b) => navigate(`/boards/${b.id}`) });
  }

  async function saveBanner(value: File | string) {
    if (!bannerFor) return;
    let boardId: number;
    try {
      boardId = await boardIdOf(bannerFor.id);
    } catch {
      return;
    }
    setBanner.mutate(
      { boardId, current: stats[bannerFor.id]?.background ?? null, value },
      { onSuccess: () => setBannerFor(null) },
    );
  }

  const s = detail ? stats[detail.id] : undefined;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{t("board.boards.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("board.boards.subtitle")}</p>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder={t("board.boards.search")} />
      </div>
      {!isLoading && shown.length === 0 ? (
        <EmptyState icon={SquareKanban} title={t("board.boards.empty")} description={t("board.boards.emptyHint")} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((p) => (
                <BoardCard
                  key={p.id}
                  project={p}
                  stats={stats[p.id]}
                  bannerUrl={stats[p.id]?.background ? banners[stats[p.id]!.background!] : undefined}
                  canBanner={isAdmin() || roles[p.id] === "pic"}
                  canMaster={canUpdate("master")}
                  onOpen={() => open(p.id)}
                  onDetail={() => setDetail(p)}
                  onBanner={() => setBannerFor(p)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <DetailDialog
        title={detail ? `${detail.project_code} · ${detail.project_name}` : ""}
        fields={
          detail && [
            ...projectDetailFields(detail, t),
            {
              label: t("board.boards.tasks"),
              value: t("board.boards.taskSummary", { open: s?.open ?? 0, overdue: s?.overdue ?? 0, done: s?.done ?? 0 }),
            },
            {
              label: t("board.boards.members"),
              block: true,
              value: (
                <ul className="space-y-1.5">
                  {members.map((m) => (
                    <li key={m.user_id} className="flex items-center gap-2 text-sm">
                      <UserAvatar name={m.profile?.full_name ?? "?"} avatarUrl={m.profile?.avatar_url} size="sm" />
                      <span className="flex-1">{m.profile?.full_name}</span>
                      <span className="text-xs text-muted-foreground">{t(`board.roles.${m.member_role}`)}</span>
                    </li>
                  ))}
                </ul>
              ),
            },
          ]
        }
        onClose={() => setDetail(null)}
        footer={
          detail && (
            <button
              type="button"
              onClick={() => open(detail.id)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <SquareKanban className="h-4 w-4" />
              {t("board.boards.openBoard")}
            </button>
          )
        }
      />

      {bannerFor && (
        <BannerPicker
          open
          onOpenChange={(o) => !o && setBannerFor(null)}
          current={stats[bannerFor.id]?.background ?? null}
          seed={bannerFor.id}
          onPick={(value) => void saveBanner(value)}
          onUpload={() => fileRef.current?.click()}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > MAX_BANNER) return void toast.error(t("board.banner.tooLarge"));
          void saveBanner(file);
        }}
      />
    </div>
  );
}
