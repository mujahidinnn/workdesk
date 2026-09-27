import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ImportResult } from "@/lib/importMasterData";

interface ImportDialogProps<T> {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Parses the uploaded file into valid rows + row-level errors */
  onParse: (file: File) => Promise<ImportResult<T>>;
  /** Bulk-inserts the valid rows once the user confirms */
  onImport: (rows: T[]) => Promise<void>;
}

export function ImportDialog<T>({
  open,
  onOpenChange,
  onParse,
  onImport,
}: ImportDialogProps<T>) {
  const { t } = useTranslation();
  const [result, setResult] = useState<ImportResult<T> | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  function reset() {
    setResult(null);
    setParsing(false);
    setImporting(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true);
    try {
      setResult(await onParse(file));
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    if (!result || result.valid.length === 0) return;
    setImporting(true);
    try {
      await onImport(result.valid);
      // Each row's create-mutation toasts on its own; collapse them into one summary.
      toast.dismiss();
      toast.success(
        t(
          result.valid.length === 1
            ? "master.import.success_one"
            : "master.import.success_other",
          { count: result.valid.length },
        ),
      );
      onOpenChange(false);
      reset();
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!importing) {
          onOpenChange(v);
          if (!v) reset();
        }
      }}
    >
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base font-semibold">
            {t("master.import.title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t("master.import.desc")}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <label className="flex flex-col items-center justify-center gap-2 h-28 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors">
            {parsing ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">
              {parsing
                ? t("master.import.parsing")
                : t("master.import.chooseFile")}
            </span>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              disabled={parsing}
              onChange={handleFile}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900/30 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              {t(
                result.valid.length === 1
                  ? "master.import.validRows_one"
                  : "master.import.validRows_other",
                { count: result.valid.length },
              )}
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 dark:bg-amber-950/40 dark:border-amber-900/30 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {t(
                    result.errors.length === 1
                      ? "master.import.skippedRows_one"
                      : "master.import.skippedRows_other",
                    { count: result.errors.length },
                  )}
                </div>
                <div className="max-h-28 overflow-y-auto scrollbar-thin space-y-0.5 px-1">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground">
                      {t("master.import.rowError", {
                        row: e.row,
                        message: e.message,
                      })}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {result.valid.length === 0 && result.errors.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                {t("master.import.noValidRows")}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border text-muted-foreground"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            {t("master.import.cancel")}
          </Button>
          {result && result.valid.length > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={importing}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {importing
                ? t("master.import.importing")
                : t("master.import.confirm", { count: result.valid.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
