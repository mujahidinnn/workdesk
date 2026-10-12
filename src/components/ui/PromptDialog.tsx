import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  clearLabel,
  defaultValue = "",
  placeholder,
  type = "text",
  allowEmpty = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  clearLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  type?: "text" | "number";
  allowEmpty?: boolean;
  onSubmit: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  const canSubmit = allowEmpty || !!value.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base font-semibold">
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onSubmit(value.trim());
            onOpenChange(false);
          }}
        >
          <Input
            autoFocus
            type={type}
            min={type === "number" ? 1 : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="bg-secondary border-border text-foreground text-sm h-9"
          />
          <DialogFooter className="gap-2">
            {clearLabel && defaultValue && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="sm:mr-auto text-destructive hover:text-destructive"
                onClick={() => {
                  onSubmit("");
                  onOpenChange(false);
                }}
              >
                {clearLabel}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
