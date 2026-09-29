import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TimePickerField } from "@/components/ui/time-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LocationMap } from "./RichMessageCard";
import type { ChatPayload } from "@/lib/types";

export type RichKind = "location" | "event" | "poll";

const MAX_OPTIONS = 12;

interface RichMessageDialogProps {
  kind: RichKind | null;
  onClose: () => void;
  /** body is the plain-text summary used by previews, search and notifications. */
  onSend: (payload: ChatPayload, body: string) => void;
  sending: boolean;
}

export function RichMessageDialog({
  kind,
  onClose,
  onSend,
  sending,
}: RichMessageDialogProps) {
  const { t } = useTranslation();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState("");
  const [where, setWhere] = useState("");
  const [notes, setNotes] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [rsvp, setRsvp] = useState(true);

  // Fresh form every time it opens.
  useEffect(() => {
    if (!kind) return;
    setCoords(null);
    setTitle("");
    setDate(null);
    setTime("");
    setWhere("");
    setNotes("");
    setQuestion("");
    setOptions(["", ""]);
    setMulti(false);
    setRsvp(true);
    if (kind !== "location") return;
    if (!navigator.geolocation) {
      toast.error(t("chat.rich.locationDenied"));
      return onClose();
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        toast.error(t("chat.rich.locationDenied"));
        onClose();
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, [kind, onClose, t]);

  const filledOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSend =
    kind === "location"
      ? !!coords
      : kind === "event"
        ? !!title.trim() && !!date && !!time
        : !!question.trim() && filledOptions.length >= 2;

  function submit() {
    if (!canSend || !kind) return;
    if (kind === "location" && coords) {
      onSend(
        { type: "location", ...coords },
        `📍 ${t("chat.rich.location")}`,
      );
    } else if (kind === "event") {
      onSend(
        {
          type: "event",
          title: title.trim(),
          starts_at: new Date(`${date}T${time}`).toISOString(),
          ...(where.trim() && { location: where.trim() }),
          ...(notes.trim() && { description: notes.trim() }),
          rsvp,
        },
        `📅 ${title.trim()}`,
      );
    } else {
      onSend(
        {
          type: "poll",
          question: question.trim(),
          options: filledOptions,
          multi,
        },
        `📊 ${question.trim()}`,
      );
    }
  }

  return (
    <Dialog open={kind != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === "location"
              ? t("chat.rich.shareLocation")
              : kind === "event"
                ? t("chat.rich.newEvent")
                : t("chat.rich.newPoll")}
          </DialogTitle>
        </DialogHeader>

        {kind === "location" &&
          (coords ? (
            <div className="flex justify-center">
              <LocationMap lat={coords.lat} lng={coords.lng} />
            </div>
          ) : (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("chat.rich.locating")}
            </p>
          ))}

        {kind === "event" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-title">{t("chat.rich.eventTitle")}</Label>
              <Input
                id="ev-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DatePickerField
                label={t("chat.rich.eventDate")}
                value={date}
                onChange={setDate}
                fromDate={format(new Date(), "yyyy-MM-dd")}
                required
              />
              <TimePickerField
                label={t("chat.rich.eventTime")}
                value={time}
                onChange={setTime}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-where">{t("chat.rich.eventWhere")}</Label>
              <Input
                id="ev-where"
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-notes">{t("chat.rich.eventNotes")}</Label>
              <Textarea
                id="ev-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="ev-rsvp">{t("chat.rich.askRsvp")}</Label>
              <Switch
                id="ev-rsvp"
                checked={rsvp}
                onCheckedChange={setRsvp}
              />
            </div>
          </div>
        )}

        {kind === "poll" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="poll-q">{t("chat.rich.pollQuestion")}</Label>
              <Input
                id="poll-q"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("chat.rich.pollOptions")}</Label>
              {options.map((opt, i) => (
                <div key={i} className="flex gap-1.5">
                  <Input
                    value={opt}
                    placeholder={t("chat.rich.pollOption", { n: i + 1 })}
                    maxLength={100}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((o, j) => (j === i ? e.target.value : o)),
                      )
                    }
                  />
                  {options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("common.delete")}
                      onClick={() =>
                        setOptions((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="flex-shrink-0 text-muted-foreground"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              {options.length < MAX_OPTIONS && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOptions((prev) => [...prev, ""])}
                  className="text-primary hover:text-primary"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t("chat.rich.addOption")}
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="poll-multi">{t("chat.rich.allowMultiple")}</Label>
              <Switch
                id="poll-multi"
                checked={multi}
                onCheckedChange={setMulti}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!canSend}
            loading={sending}
          >
            {t("chat.rich.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
