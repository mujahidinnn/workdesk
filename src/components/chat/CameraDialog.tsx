import { useEffect, useRef } from "react";
import { Camera } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface CameraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
}

// In-app camera: <input capture> is ignored on desktop and some Android
// browsers, so we stream getUserMedia and snapshot to a canvas instead.
export function CameraDialog({
  open,
  onOpenChange,
  onCapture,
}: CameraDialogProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => {
        toast.error(t("chat.cameraDenied"));
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, onOpenChange, t]);

  function snap() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(
          new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }),
        );
        onOpenChange(false);
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden bg-black border-0 max-w-lg">
        <DialogTitle className="sr-only">{t("chat.takePhoto")}</DialogTitle>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full max-h-[75vh] object-contain bg-black"
        />
        <div className="flex justify-center pb-5">
          <Button
            type="button"
            size="icon"
            onClick={snap}
            aria-label={t("chat.takePhoto")}
            className="h-14 w-14 rounded-full bg-white text-black hover:bg-white/90"
          >
            <Camera className="w-6 h-6" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
