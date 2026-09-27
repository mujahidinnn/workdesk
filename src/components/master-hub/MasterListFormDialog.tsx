import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
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

interface MasterListFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initialValue: string | null;
  onSubmit: (value: string) => void;
  loading?: boolean;
}

export function MasterListFormDialog({
  open,
  onOpenChange,
  title,
  initialValue,
  onSubmit,
  loading,
}: MasterListFormDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(initialValue ?? "");
  }, [initialValue, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
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
              disabled={loading || !value.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  {t("master.masterList.saving")}
                </>
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
