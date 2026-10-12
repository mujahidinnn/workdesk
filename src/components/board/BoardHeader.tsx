import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ArrowLeft, BarChart3, ImageIcon, List, SquareKanban, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import { SearchInput } from "@/components/master-hub/MasterSection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSetBanner } from "@/hooks/useBoard";
import { useBannerUrls } from "@/hooks/useBoards";
import type { BoardFilter } from "@/lib/boardFilter";
import { isBoardPic } from "@/lib/taskPermissions";
import { useBoardCtx } from "./BoardContext";
import { BoardBanner } from "./BoardBanner";
import { BannerPicker } from "./BannerPicker";
import { MembersPopover } from "./MembersPopover";

export type BoardView = "board" | "list" | "workload";
const VIEWS = [
  { id: "board", icon: SquareKanban },
  { id: "list", icon: List },
  { id: "workload", icon: BarChart3 },
] as const;
const MAX_BANNER = 5 * 1024 * 1024;

export function BoardHeader({
  filter,
  onFilter,
  view,
  onView,
  onArchived,
}: {
  filter: BoardFilter;
  onFilter: (f: BoardFilter) => void;
  view: BoardView;
  onView: (v: BoardView) => void;
  onArchived: () => void;
}) {
  const { t } = useTranslation();
  const { data, divisions, access } = useBoardCtx();
  const set = (patch: Partial<BoardFilter>) => onFilter({ ...filter, ...patch });
  const banner = data.board.background;
  const { data: urls = {} } = useBannerUrls([banner]);
  const setBanner = useSetBanner();
  const saveBanner = (value: File | string | null, onSuccess?: () => void) =>
    setBanner.mutate({ boardId: data.board.id, current: banner, value }, { onSuccess });
  const fileRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const mine = filter.assignee === access.userId;

  function pickBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BANNER) return void toast.error(t("board.banner.tooLarge"));
    saveBanner(file);
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl">
        <BoardBanner background={banner} url={banner ? urls[banner] : undefined} seed={data.board.project_id} className="h-28 w-full" />
        {isBoardPic(access) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-black/40 px-2 py-1 text-xs text-white backdrop-blur hover:bg-black/60"
              disabled={setBanner.isPending}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {t("board.banner.change")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setPicking(true)}>{t("board.banner.pick")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileRef.current?.click()}>{t("board.banner.upload")}</DropdownMenuItem>
              {banner && (
                <DropdownMenuItem onClick={() => saveBanner(null)}>{t("board.banner.reset")}</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickBanner} />
        <BannerPicker
          open={picking}
          onOpenChange={setPicking}
          current={banner}
          seed={data.board.project_id}
          onPick={(value) => saveBanner(value, () => setPicking(false))}
          onUpload={() => {
            setPicking(false);
            fileRef.current?.click();
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            to="/boards"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("board.boards.back")}
            title={t("board.boards.back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="font-mono text-xs text-muted-foreground">{data.board.project.project_code}</p>
            <h1 className="text-lg font-semibold text-foreground">{data.board.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onArchived}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("board.archived.title")}
            title={t("board.archived.title")}
          >
            <Archive className="h-4 w-4" />
          </button>
          <MembersPopover />
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-segment p-0.5">
            {VIEWS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onView(id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                  view === id ? "border border-border bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`board.views.${id}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={filter.q} onChange={(q) => set({ q })} placeholder={t("board.filter.search")} />
        <button
          type="button"
          aria-pressed={mine}
          onClick={() => set({ assignee: mine ? undefined : access.userId })}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs",
            mine ? "border-primary/50 text-primary" : "border-border bg-secondary text-muted-foreground",
          )}
        >
          <UserCheck className="h-3.5 w-3.5" />
          {t("board.filter.mine")}
        </button>
        <FilterSelect
          value={filter.assignee}
          onChange={(assignee) => set({ assignee })}
          allLabel={t("board.filter.allPeople")}
          options={data.members.map((m) => ({ value: m.user_id, label: m.profile?.full_name ?? "?" }))}
        />
        <FilterSelect
          value={filter.division?.toString()}
          onChange={(v) => set({ division: v ? Number(v) : undefined })}
          allLabel={t("board.filter.allDivisions")}
          options={divisions.map((d) => ({ value: String(d.id), label: d.name }))}
        />
        {data.labels.length > 0 && (
          <FilterSelect
            value={filter.label?.toString()}
            onChange={(v) => set({ label: v ? Number(v) : undefined })}
            allLabel={t("board.filter.allLabels")}
            options={data.labels.map((l) => ({ value: String(l.id), label: l.name }))}
          />
        )}
        <FilterSelect
          value={filter.due}
          onChange={(due) => set({ due })}
          allLabel={t("board.filter.anyDue")}
          options={[
            { value: "overdue" as const, label: t("board.filter.overdue") },
            { value: "week" as const, label: t("board.filter.week") },
          ]}
        />
      </div>
    </div>
  );
}
