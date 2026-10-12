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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface MasterListFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initialValue: string | null;
  initialDescription?: string | null;
  onSubmit: (value: string, description: string | null) => void;
  loading?: boolean;
}

export function MasterListFormDialog({
  open,
  onOpenChange,
  title,
  initialValue,
  initialDescription,
  onSubmit,
  loading,
}: MasterListFormDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const withDescription = initialDescription !== undefined;

  useEffect(() => {
    setValue(initialValue ?? "");
    setDescription(initialDescription ?? "");
  }, [initialValue, initialDescription, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim(), description.trim() || null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base font-semibold">
            {initialValue != null
              ? t("master.masterList.editItem", { title })
              : t("master.masterList.addNew", { title })}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">
              {t("master.masterList.columnName")}
            </Label>
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("master.masterList.namePlaceholder")}
              className="bg-secondary border-border text-foreground text-sm h-9"
            />
          </div>

          {withDescription && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("master.masterList.description")}
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("master.masterList.descriptionPlaceholder")}
                rows={3}
                className="bg-secondary border-border text-foreground text-sm"
              />
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
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
              type="submit"
              size="sm"
              disabled={!value.trim()}
              loading={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? (
                t("master.masterList.saving")
              ) : initialValue != null ? (
                t("master.masterList.save")
              ) : (
                t("master.masterList.add")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
