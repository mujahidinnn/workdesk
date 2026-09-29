import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, Check, Link2, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/context/auth";
import { useToggleVote } from "@/hooks/useChat";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatPayload, ChatPollVote } from "@/lib/types";

const TILE = 256;
const ZOOM = 16;

/** Static map from OSM tiles (no API key, no iframe): 3x3 tiles shifted so
 *  the point sits in the middle of the viewport. */
export function LocationMap({ lat, lng }: { lat: number; lng: number }) {
  const n = 2 ** ZOOM;
  const xt = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const yt = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const [tx, ty] = [Math.floor(xt), Math.floor(yt)];
  const [w, h] = [256, 150];
  const left = w / 2 - (TILE + (xt - tx) * TILE);
  const top = h / 2 - (TILE + (yt - ty) * TILE);

  return (
    <div
      className="relative overflow-hidden rounded-lg bg-secondary"
      style={{ width: w, height: h, maxWidth: "100%" }}
    >
      <div
        className="absolute grid grid-cols-3"
        style={{ left, top, width: TILE * 3 }}
      >
        {[-1, 0, 1].flatMap((dy) =>
          [-1, 0, 1].map((dx) => (
            <img
              key={`${dx},${dy}`}
              src={`https://tile.openstreetmap.org/${ZOOM}/${tx + dx}/${ty + dy}.png`}
              alt=""
              width={TILE}
              height={TILE}
              loading="lazy"
              draggable={false}
            />
          )),
        )}
      </div>
      <MapPin className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full w-7 h-7 text-rose-600 fill-rose-500/30 drop-shadow" />
      <span className="absolute bottom-0 right-0 bg-white/80 px-1 text-[9px] text-neutral-700">
        © OpenStreetMap
      </span>
    </div>
  );
}

/** Who picked what, one section per option. */
function VotersDialog({
  open,
  onOpenChange,
  title,
  labels,
  votes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  labels: string[];
  votes: ChatPollVote[];
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words pr-6">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {labels.map((label, i) => {
            const list = votes.filter((v) => v.option_idx === i);
            return (
              <div key={i}>
                <div className="flex items-baseline justify-between gap-2 border-b border-border pb-1 mb-1.5">
                  <p className="text-sm font-medium text-foreground break-words">
                    {label}
                  </p>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {list.length}
                  </span>
                </div>
                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("chat.rich.noVotes")}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((v) => (
                      <li
                        key={v.user_id}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <UserAvatar
                          name={v.voter?.full_name ?? "Unknown"}
                          avatarUrl={v.voter?.avatar_url}
                          size="xs"
                        />
                        {v.voter?.full_name ?? "Unknown"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RichMessageCard({
  message,
  channelId,
}: {
  message: ChatMessage & { payload: ChatPayload };
  channelId: number;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const dateFnsLocale = useDateFnsLocale();
  const toggleVote = useToggleVote();
  const p = message.payload;
  const votes = message.poll_votes ?? [];
  const [showVoters, setShowVoters] = useState(false);
  const viewVoters = (
    <button
      type="button"
      onClick={() => setShowVoters(true)}
      className="text-[11px] font-medium text-primary hover:underline"
    >
      {t("chat.rich.viewVoters")}
    </button>
  );

  const vote = (option: number) =>
    toggleVote.mutate(
      { messageId: message.id, channelId, option },
      { onError: (e: Error) => toast.error(e.message) },
    );
  const countOf = (i: number) => votes.filter((v) => v.option_idx === i).length;
  const mine = (i: number) =>
    votes.some((v) => v.option_idx === i && v.user_id === user?.id);

  const card =
    "mt-1 w-72 max-w-full rounded-xl border border-border bg-secondary/40 p-3 text-left text-xs";

  if (p.type === "location") {
    return (
      <a
        href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(card, "block p-1.5 hover:bg-secondary/70")}
      >
        <LocationMap lat={p.lat} lng={p.lng} />
        <p className="px-1.5 pt-1.5 font-medium text-foreground">
          {t("chat.rich.location")}
        </p>
        <p className="px-1.5 pb-0.5 text-[11px] text-primary">
          {t("chat.rich.openInMaps")}
        </p>
      </a>
    );
  }

  if (p.type === "event") {
    return (
      <div className={card}>
        <div className="flex gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <CalendarDays className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground break-words">
              {p.title}
            </p>
            <p className="text-muted-foreground">
              {format(new Date(p.starts_at), "EEEE, d MMM yyyy · HH:mm", {
                locale: dateFnsLocale,
              })}
            </p>
            {p.location &&
              (/^https?:\/\//i.test(p.location) ? (
                <a
                  href={p.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 mt-0.5"
                >
                  <Link2 className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{p.location}</span>
                </a>
              ) : (
                <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{p.location}</span>
                </p>
              ))}
          </div>
        </div>
        {p.description && (
          <p className="mt-2 text-foreground whitespace-pre-wrap break-words">
            {p.description}
          </p>
        )}
        {p.rsvp !== false && (
          <>
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          {[t("chat.rich.going"), t("chat.rich.notGoing")].map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => vote(i)}
              disabled={toggleVote.isPending}
              className={cn(
                "h-8 rounded-lg border text-xs font-medium transition-colors",
                mine(i)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:bg-secondary",
              )}
            >
              {label} · {countOf(i)}
            </button>
          ))}
        </div>
        {votes.length > 0 && <div className="mt-2 text-right">{viewVoters}</div>}
        <VotersDialog
          open={showVoters}
          onOpenChange={setShowVoters}
          title={p.title}
          labels={[t("chat.rich.going"), t("chat.rich.notGoing")]}
          votes={votes}
        />
          </>
        )}
      </div>
    );
  }

  const voters = new Set(votes.map((v) => v.user_id)).size;
  return (
    <div className={card}>
      <p className="font-semibold text-sm text-foreground break-words">
        {p.question}
      </p>
      <p className="text-[11px] text-muted-foreground mb-2">
        {p.multi ? t("chat.rich.selectMany") : t("chat.rich.selectOne")}
      </p>
      <div className="space-y-1.5">
        {p.options.map((opt, i) => {
          const count = countOf(i);
          const picked = mine(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => vote(i)}
              disabled={toggleVote.isPending}
              className="relative w-full overflow-hidden rounded-lg border border-border bg-background px-2.5 py-2 text-left hover:border-primary/50 transition-colors"
            >
              <span
                className="absolute inset-y-0 left-0 bg-primary/10 transition-all"
                style={{ width: voters ? `${(count / voters) * 100}%` : 0 }}
              />
              <span className="relative flex items-center gap-2">
                <span
                  className={cn(
                    "w-4 h-4 flex-shrink-0 border flex items-center justify-center",
                    p.multi ? "rounded" : "rounded-full",
                    picked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/50",
                  )}
                >
                  {picked && <Check className="w-3 h-3" />}
                </span>
                <span className="flex-1 min-w-0 break-words text-foreground">
                  {opt}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {count}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-muted-foreground">
          {t("chat.rich.voters", { count: voters })}
        </p>
        {voters > 0 && viewVoters}
      </div>
      <VotersDialog
        open={showVoters}
        onOpenChange={setShowVoters}
        title={p.question}
        labels={p.options}
        votes={votes}
      />
    </div>
  );
}
