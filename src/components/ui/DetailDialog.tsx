import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface DetailField {
  label: string;
  value: ReactNode;
  block?: boolean;
}

interface DetailDialogProps {
  title: string;
  fields: DetailField[] | null;
  onClose: () => void;
  footer?: ReactNode;
}

const isEmpty = (v: ReactNode) => v == null || v === "" || v === false;

export function DetailDialog({
  title,
  fields,
  onClose,
  footer,
}: DetailDialogProps) {
  const inline = fields?.filter((f) => !f.block) ?? [];
  const blocks = fields?.filter((f) => f.block) ?? [];

  return (
    <Dialog open={!!fields} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base font-semibold">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="-mx-5 min-h-0 flex-1 space-y-4 overflow-y-auto px-5 scrollbar-thin sm:-mx-6 sm:px-6">
          {inline.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {inline.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-xs text-muted-foreground pt-0.5">
                    {f.label}
                  </dt>
                  <dd className="text-foreground break-words min-w-0">
                    {isEmpty(f.value) ? "-" : f.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {blocks.map((f) => (
            <div key={f.label} className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{f.label}</p>
              {isEmpty(f.value) ? (
                <p className="text-sm text-foreground">-</p>
              ) : (
                <div className="text-sm text-foreground whitespace-pre-wrap break-words rounded-md bg-secondary border border-border px-3 py-2">
                  {f.value}
                </div>
              )}
            </div>
          ))}
        </div>

        {footer && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
