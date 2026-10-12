import { useState } from "react";
import { Check, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PALETTES, PATTERNS, PRESETS, bannerChoice, bannerCss, patternValue, presetValue } from "@/lib/bannerPatterns";
import { cn } from "@/lib/utils";

export function BannerPicker({
  open,
  onOpenChange,
  current,
  seed,
  onPick,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: string | null;
  seed: number;
  onPick: (value: string) => void;
  onUpload: () => void;
}) {
  const { t } = useTranslation();
  const now = bannerChoice(current, seed);
  const [palette, setPalette] = useState(now.palette);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("board.banner.pickTitle")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-1 scrollbar-thin">
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("board.banner.illustrations")}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(presetValue(p.id))}
                className={cn(
                  "relative h-16 overflow-hidden rounded-lg border border-border hover:ring-2 hover:ring-ring/50",
                  current === presetValue(p.id) && "ring-2 ring-ring",
                )}
                aria-label={p.id}
                title={p.id}
              >
                <img src={p.src} alt="" className="h-full w-full object-cover" />
                {current === presetValue(p.id) && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-0.5 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
        <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("board.banner.patterns")}</h3>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("board.banner.palette")}>
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === palette}
              aria-label={p.id}
              title={p.id}
              onClick={() => setPalette(p.id)}
              className={cn(
                "flex h-8 w-14 overflow-hidden rounded-md border border-border",
                p.id === palette && "ring-2 ring-ring ring-offset-2 ring-offset-background",
              )}
            >
              {p.colors.map((c) => (
                <span key={c} className="flex-1" style={{ background: c }} />
              ))}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PATTERNS.map((p) => {
            const selected = current?.startsWith("pattern:") && now.pattern === p.id && now.palette === palette;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(patternValue({ pattern: p.id, palette }))}
                className={cn(
                  "relative h-16 overflow-hidden rounded-lg border border-border hover:ring-2 hover:ring-ring/50",
                  selected && "ring-2 ring-ring",
                )}
                style={{ background: bannerCss({ pattern: p.id, palette }) }}
                aria-label={p.id}
                title={p.id}
              >
                {selected && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-0.5 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        </section>
        </div>
        <Button variant="outline" className="w-full gap-2" onClick={onUpload}>
          <Upload className="h-4 w-4" />
          {t("board.banner.upload")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
