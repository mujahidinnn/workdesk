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
  /** Long content (notes, descriptions, files) gets its own full-width block. */
  block?: boolean;
}

interface DetailDialogProps {
  title: string;
  /** null = closed. */
  fields: DetailField[] | null;
  onClose: () => void;
  /** Actions under the fields, e.g. a link to the full page. */
  footer?: ReactNode;
}

const isEmpty = (v: ReactNode) => v == null || v === "" || v === false;

/** Read-only view of one table row, opened by clicking the row. */
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
      <DialogContent className="bg-card border-border max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base font-semibold">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
