import { useEffect, useRef, useState } from "react";
import {
  X,
  SendHorizontal,
  Paperclip,
  FileText,
  Loader2,
  Mic,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EmojiPicker } from "./EmojiPicker";
import { useSendChatMessage } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import type { ChatMessage, UserWithEmail } from "@/lib/types";

// Matches the chat-attachments bucket's file_size_limit / allowed_mime_types.
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPT_TYPES =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";

interface PendingFile {
  file: File;
  previewUrl: string | null;
}

interface MessageComposerProps {
  channelId: number;
  members: UserWithEmail[];
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
}

export function MessageComposer({
  channelId,
  members,
  replyTo,
  onCancelReply,
}: MessageComposerProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());
  const [mentionsEveryone, setMentionsEveryone] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendMessage = useSendChatMessage();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recording) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => () => recorderRef.current?.stop(), []);

  async function toggleRecording() {
    if (recorderRef.current) return recorderRef.current.stop();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast.error(t("chat.micDenied"));
    }
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      setRecording(false);
      // "audio/webm;codecs=opus" -> "audio/webm": the bucket matches bare types.
      const type = (recorder.mimeType || "audio/webm").split(";")[0];
      addFiles([
        new File(chunks, `voice-${Date.now()}.${type.split("/")[1]}`, {
          type,
        }),
      ]);
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }

  function addFiles(files: File[]) {
    const accepted: PendingFile[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("chat.fileTooLarge", { name: file.name }));
        continue;
      }
      accepted.push({
        file,
        previewUrl: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null,
      });
    }
    if (accepted.length > 0) setPendingFiles((prev) => [...prev, ...accepted]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(e.clipboardData?.items ?? [])
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f != null);
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  }

  const mentionMatches: Array<UserWithEmail | "everyone"> =
    mentionQuery === null
      ? []
      : [
          ...("everyone".startsWith(mentionQuery.toLowerCase())
            ? (["everyone"] as const)
            : []),
          ...members
            .filter((m) =>
              (m.full_name ?? m.email)
                .toLowerCase()
                .includes(mentionQuery.toLowerCase()),
            )
            .slice(0, 6),
        ];

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const caret = e.target.selectionStart;
    setText(value);

    const uptoCaret = value.slice(0, caret);
    const at = uptoCaret.lastIndexOf("@");
    if (at === -1 || /\s/.test(uptoCaret.slice(at + 1))) {
      setMentionQuery(null);
    } else {
      setMentionQuery(uptoCaret.slice(at + 1));
    }
    setHighlightIndex(0);
  }

  function pickMention(user: UserWithEmail | "everyone") {
    const caret = textareaRef.current?.selectionStart ?? text.length;
    const uptoCaret = text.slice(0, caret);
    const at = uptoCaret.lastIndexOf("@");
    if (at === -1) return;
    const name =
      user === "everyone" ? "everyone" : (user.full_name ?? user.email);
    const next = `${text.slice(0, at)}@${name} ${text.slice(caret)}`;
    setText(next);
    if (user === "everyone") setMentionsEveryone(true);
    else setMentionedIds((prev) => new Set(prev).add(user.id));
    setMentionQuery(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function insertEmoji(emoji: string) {
    const caret = textareaRef.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, caret)}${emoji}${text.slice(caret)}`;
    setText(next);
    requestAnimationFrame(() => {
      const pos = caret + emoji.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }

  function send() {
    const body = text.trim();
    if ((!body && pendingFiles.length === 0) || sendMessage.isPending) return;
    sendMessage.mutate(
      {
        channelId,
        body,
        replyToId: replyTo?.id ?? null,
        mentions: [...mentionedIds],
        mentionsEveryone: mentionsEveryone && /@everyone\b/.test(body),
        files: pendingFiles.map((p) => p.file),
      },
      {
        onSuccess: () => {
          setText("");
          setMentionedIds(new Set());
          setMentionsEveryone(false);
          pendingFiles.forEach(
            (p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl),
          );
          setPendingFiles([]);
          onCancelReply();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex(
          (i) => (i - 1 + mentionMatches.length) % mentionMatches.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(
          mentionMatches[Math.min(highlightIndex, mentionMatches.length - 1)],
        );
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="border-t border-border p-3">
      {replyTo && (
        <div className="flex items-center justify-between gap-2 mb-2 px-2.5 py-1.5 rounded-md bg-secondary/60 text-xs">
          <span className="text-muted-foreground truncate">
            {t("chat.replyingTo")}{" "}
            <span className="font-medium text-foreground">
              {replyTo.sender?.full_name ?? "Unknown"}
            </span>
          </span>
          <button
            onClick={onCancelReply}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="relative">
        {mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1.5 w-64 max-h-48 overflow-y-auto scrollbar-thin bg-card border border-border rounded-lg shadow-xl py-1 z-20">
            {mentionMatches.map((m, i) => (
              <button
                key={m === "everyone" ? "everyone" : m.id}
                type="button"
                onMouseEnter={() => setHighlightIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickMention(m);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground text-left",
                  i === highlightIndex
                    ? "bg-secondary/60"
                    : "hover:bg-secondary/60",
                )}
              >
                {m === "everyone" ? (
                  <>
                    <span className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                      @
                    </span>
                    <span className="font-medium">everyone</span>
                    <span className="text-muted-foreground">
                      {t("chat.notifyAll")}
                    </span>
                  </>
                ) : (
                  <>
                    <UserAvatar
                      name={m.full_name ?? m.email}
                      avatarUrl={m.avatar_url}
                      size="xs"
                    />
                    {m.full_name ?? m.email}
                    {m.employee_role_title && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {m.employee_role_title}
                      </span>
                    )}
                  </>
                )}
              </button>
            ))}
          </div>
        )}

        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingFiles.map((p, i) => (
              <div key={i} className="relative group">
                {p.previewUrl ? (
                  <img
                    src={p.previewUrl}
                    alt={p.file.name}
                    className="w-14 h-14 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg border border-border bg-secondary flex flex-col items-center justify-center gap-0.5 px-1">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[8px] text-muted-foreground truncate max-w-full">
                      {p.file.name}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <EmojiPicker onPick={insertEmoji} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleRecording}
            aria-label={
              recording ? t("chat.stopRecording") : t("chat.recordVoice")
            }
            title={recording ? t("chat.stopRecording") : t("chat.recordVoice")}
            className={cn(
              "flex-shrink-0",
              recording
                ? "rounded-full bg-destructive text-white hover:bg-destructive/90 hover:text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {recording ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_TYPES}
            className="hidden"
            onChange={handleFileInputChange}
          />
          {recording && (
            <div className="flex-1 h-9 flex items-center gap-2.5 px-3 rounded-md border border-destructive/30 bg-destructive/10 text-sm">
              <span className="relative flex w-2.5 h-2.5">
                <span className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-75" />
                <span className="relative w-2.5 h-2.5 rounded-full bg-destructive" />
              </span>
              <span className="text-destructive font-medium">
                {t("chat.recording")}
              </span>
              <span className="ml-auto tabular-nums text-muted-foreground">
                {Math.floor(elapsed / 60)}:
                {String(elapsed % 60).padStart(2, "0")}
              </span>
            </div>
          )}
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={t("chat.messagePlaceholder")}
            rows={1}
            className={cn(
              "bg-secondary border-border text-foreground text-sm resize-none min-h-9 max-h-32 placeholder:truncate",
              recording && "hidden",
            )}
          />
          <Button
            size="icon"
            onClick={send}
            disabled={
              (!text.trim() && pendingFiles.length === 0) ||
              sendMessage.isPending
            }
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"
          >
            {sendMessage.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <SendHorizontal className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
