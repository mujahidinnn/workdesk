import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";

interface HolidayFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialDate: string | null;
  onSubmit: (data: { date: string; name: string }) => void;
  loading?: boolean;
}

export function HolidayFormDialog({
  open,
  onOpenChange,
  initialDate,
  onSubmit,
  loading,
}: HolidayFormDialogProps) {
  const { t } = useTranslation();
  const [date, setDate] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) {
      setDate(initialDate);
      setName("");
    }
  }, [open, initialDate]);

  const canSave = !!date && name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base font-semibold">
            {t("calendar.dialog.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <DatePickerField
            label={t("calendar.dialog.date")}
            value={date}
            onChange={setDate}
            required
          />
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              {t("calendar.dialog.name")}
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("calendar.dialog.namePlaceholder")}
              className="bg-secondary border-border text-foreground text-sm h-9"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border text-muted-foreground hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            loading={loading}
            onClick={() => date && onSubmit({ date, name: name.trim() })}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
