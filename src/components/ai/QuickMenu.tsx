import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertOctagon, BarChart3, CalendarClock, CalendarDays, CalendarOff, ChevronDown, ClipboardPlus,
  Clock, FilePlus2, Inbox, KanbanSquare, ListChecks, PalmtreeIcon, UserCheck, UserX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/context/auth";
import { useAiPanel } from "@/components/ai/AiProvider";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Item =
  | { key: string; icon: LucideIcon; allowed: boolean; kind: "fill" | "send"; prompt: string }
  | { key: string; icon: LucideIcon; allowed: boolean; kind: "go"; path: string };

const VISIBLE = 6;
const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 disabled:pointer-events-none";

// Order decides what shows first; the rest go under "More".
const LEAD_ORDER = ["approvals", "notCheckedIn", "blockers", "createTask", "projectProgress", "onLeaveWeek",
  "weekSummary", "deadlines", "dailyReport", "requestLeave", "requestOvertime", "leaveBalance", "myAttendance", "myTasks"];
const STAFF_ORDER = ["createTask", "deadlines", "weekSummary", "dailyReport", "requestLeave", "leaveBalance",
  "myAttendance", "requestOvertime", "myTasks"];

export function QuickMenu({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canCreate, canRead, canUpdate, isAdmin } = useAuth();
  const { setOpen, setDraft, send } = useAiPanel();
  // Team chips only make sense for people who approve or oversee others.
  const lead = isAdmin() || canUpdate("leave") || canUpdate("overtime-business-trip");

  const ai = (key: string, icon: LucideIcon, allowed: boolean, kind: "fill" | "send" = "send"): Item =>
    ({ key, icon, allowed, kind, prompt: t(`ai.quick.${key}Prompt`) });
  const go = (key: string, icon: LucideIcon, allowed: boolean, path: string): Item =>
    ({ key, icon, allowed, kind: "go", path });

  const all: Item[] = [
    ai("createTask", ClipboardPlus, canCreate("board"), "fill"),
    ai("weekSummary", ListChecks, canRead("daily-report")),
    ai("deadlines", CalendarClock, canRead("board")),
    ai("leaveBalance", PalmtreeIcon, canRead("leave")),
    ai("myAttendance", UserCheck, canRead("attendance")),
    ai("approvals", Inbox, lead),
    ai("notCheckedIn", UserX, lead && canRead("attendance")),
    ai("onLeaveWeek", CalendarDays, lead && canRead("leave")),
    ai("blockers", AlertOctagon, lead && canRead("issues")),
    ai("projectProgress", BarChart3, lead && canRead("board")),
    go("requestLeave", CalendarOff, canCreate("leave"), "/leave"),
    go("requestOvertime", Clock, canCreate("overtime-business-trip"), "/overtime"),
    go("dailyReport", FilePlus2, canCreate("daily-report"), "/daily-report"),
    go("myTasks", KanbanSquare, canRead("board"), "/my-tasks"),
  ];
  const byKey = new Map(all.map((i) => [i.key, i]));
  const items = (lead ? LEAD_ORDER : STAFF_ORDER)
    .map((k) => byKey.get(k))
    .filter((i): i is Item => !!i?.allowed);
  const shown = items.slice(0, VISIBLE);
  const more = items.slice(VISIBLE);

  const pick = (it: Item) => {
    if (it.kind === "go") return navigate(it.path, { state: { openAdd: true } });
    setOpen(true);
    if (it.kind === "fill") setDraft(it.prompt);
    else void send(it.prompt);
  };
  // Direct items never touch the AI, so they stay usable when it is off.
  const isOff = (it: Item) => !!disabled && it.kind !== "go";

  return (
    <div data-tour="dashboard-ai-quick" className="flex flex-wrap gap-2">
      {shown.map((it) => (
        <button key={it.key} type="button" disabled={isOff(it)} onClick={() => pick(it)} className={CHIP}>
          <it.icon className="h-3.5 w-3.5" />
          {t(`ai.quick.${it.key}`)}
        </button>
      ))}
      {more.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={CHIP}>
              {t("ai.quick.more")}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            {more.map((it) => (
              <DropdownMenuItem key={it.key} disabled={isOff(it)} onSelect={() => pick(it)} className="gap-2 text-xs">
                <it.icon className="h-3.5 w-3.5 text-muted-foreground" />
                {t(`ai.quick.${it.key}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
