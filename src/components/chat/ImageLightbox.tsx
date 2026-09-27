import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  SmilePlus,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ForwardPicker } from "./ForwardPicker";
import { EmojiPicker } from "./EmojiPicker";
import { useToggleReaction } from "@/hooks/useChat";
import { isImageAttachment } from "@/lib/chat";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
/** Matches the header bar's h-14. */
const HEADER_HEIGHT = 56;
/** Thumbnail strip (h-[72px]) shown only when the message has several images. */
const STRIP_HEIGHT = 72;

interface ImageLightboxProps {
  message: ChatMessage;
  channelId: number;
  index: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

async function fetchBlob(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch failed");
  return res.blob();
}

export function ImageLightbox({
  message,
  channelId,
  index,
  onIndexChange,
  open,
  onOpenChange,
}: ImageLightboxProps) {
  const { t } = useTranslation();
  const dateFnsLocale = useDateFnsLocale();
  const toggleReaction = useToggleReaction();
  const images = (message.attachments ?? []).filter(isImageAttachment);
  const image = images[index];
  const hasMultiple = images.length > 1;
  const senderName = message.sender?.full_name ?? "Unknown";

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
    setNatural(null);
  }, [index, open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft")
        onIndexChange((index - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") onIndexChange((index + 1) % images.length);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, index, images.length, onIndexChange]);

  if (!image) return null;

  // The modal itself is full-screen, but the image keeps its native
  // resolution - only shrunk (preserving aspect ratio) if it wouldn't
  // otherwise fit below the header, never enlarged past 100%.
  const viewport = {
    width: window.innerWidth,
    height:
      window.innerHeight - HEADER_HEIGHT - (hasMultiple ? STRIP_HEIGHT : 0),
  };
  const fitScale = natural
    ? Math.min(1, viewport.width / natural.w, viewport.height / natural.h)
    : 1;
  const displaySize = natural
    ? {
        width: natural.w * fitScale * zoom,
        height: natural.h * fitScale * zoom,
      }
    : null;

  function zoomIn() {
    setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  }
  function zoomOut() {
    setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  }

  async function copyMedia() {
    if (!image.url) return;
    try {
      const blob = await fetchBlob(image.url);
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      toast.success(t("chat.mediaCopied"));
    } catch {
      toast.error(t("chat.mediaCopyFailed"));
    }
  }

  async function download() {
    if (!image.url) return;
    try {
      const blob = await fetchBlob(image.url);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = image.file_name;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error(t("chat.downloadFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="max-w-none w-screen h-screen inset-0 translate-x-0 translate-y-0 rounded-none border-none shadow-none bg-black p-0 gap-0 flex flex-col"
      >
        <DialogTitle className="sr-only">{image.file_name}</DialogTitle>

        <div className="h-14 flex-shrink-0 flex items-center justify-between gap-3 px-4 bg-card/95 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <UserAvatar
              name={senderName}
              avatarUrl={message.sender?.avatar_url}
              size="sm"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {senderName}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(message.created_at), {
                  addSuffix: true,
                  locale: dateFnsLocale,
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {hasMultiple && (
              <span className="text-[11px] text-muted-foreground px-1 tabular-nums">
                {index + 1} / {images.length}
              </span>
            )}
            <button
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              title={t("chat.zoomOut")}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-muted-foreground w-9 text-center tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              title={t("chat.zoomIn")}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <EmojiPicker
              align="end"
              tooltip={t("chat.react")}
              onPick={(emoji) =>
                toggleReaction.mutate({
                  messageId: message.id,
                  channelId,
                  emoji,
                  reacted: false,
                })
              }
              trigger={
                <button
                  title={t("chat.react")}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <SmilePlus className="w-4 h-4" />
                </button>
              }
            />
            <ForwardPicker message={message} />
            <button
              onClick={copyMedia}
              title={t("chat.copyMedia")}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={download}
              title={t("chat.download")}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
            <a
              href={image.url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              title={t("chat.openOriginal")}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={() => onOpenChange(false)}
              title={t("common.cancel")}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* overflow-auto only matters once zoom pushes the image past this area. */}
        <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center">
          <img
            key={image.id}
            src={image.url ?? undefined}
            alt={image.file_name}
            onLoad={(e) =>
              setNatural({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            style={
              displaySize
                ? { width: displaySize.width, height: displaySize.height }
                : undefined
            }
            className={cn(
              "block flex-shrink-0",
              !displaySize && "max-w-full max-h-full object-contain",
            )}
          />
        </div>

        {hasMultiple && (
          <div className="h-[72px] flex-shrink-0 flex items-center gap-2 px-4 overflow-x-auto scrollbar-thin bg-black [&>:first-child]:ml-auto [&>:last-child]:mr-auto">
            {images.map((img, i) => (
              <button
                key={img.id}
                onClick={() => onIndexChange(i)}
                className={cn(
                  "h-12 w-12 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all",
                  i === index
                    ? "border-primary"
                    : "border-transparent opacity-60 hover:opacity-100",
                )}
              >
                <img
                  src={img.url ?? undefined}
                  alt={img.file_name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* `fixed`, not `absolute`, so arrows don't scroll away with the zoomed image. */}
        {hasMultiple && (
          <>
            <button
              onClick={() =>
                onIndexChange((index - 1 + images.length) % images.length)
              }
              className="fixed left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={() => onIndexChange((index + 1) % images.length)}
              className="fixed right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
