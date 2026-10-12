import { bannerChoice, bannerCss, isStoredImage, presetSrc } from "@/lib/bannerPatterns";
import { cn } from "@/lib/utils";

export function BoardBanner({
  background,
  url,
  seed,
  className,
}: {
  background: string | null | undefined;
  url?: string;
  seed: number;
  className?: string;
}) {
  const src = isStoredImage(background) ? url : presetSrc(background);
  if (src) return <img src={src} alt="" className={cn("object-cover", className)} />;
  return <div aria-hidden className={className} style={{ background: bannerCss(bannerChoice(background, seed)) }} />;
}
