import { useState, type ReactNode } from "react";
import { Smile } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// A curated common-chat set grouped like Slack/Discord's picker, not the
// full Unicode range - browsers/OS render these natively so there's no
// font/asset weight to ship for it.
const EMOJI_GROUPS: { label: string; emoji: string[] }[] = [
  {
    label: "Smileys & Emotion",
    emoji: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "🤣",
      "😂",
      "🙂",
      "🙃",
      "😉",
      "😊",
      "😇",
      "🥰",
      "😍",
      "🤩",
      "😘",
      "😋",
      "😛",
      "😜",
      "🤪",
      "🤑",
      "🤗",
      "🤭",
      "🤫",
      "🤔",
      "🤨",
      "😐",
      "😑",
      "😶",
      "😏",
      "😒",
      "🙄",
      "😬",
      "😌",
      "😔",
      "😪",
      "🤤",
      "😴",
      "😷",
      "🤒",
      "🤢",
      "🥵",
      "🥶",
      "🥴",
      "😵",
      "🤯",
      "🥳",
      "😎",
      "🧐",
      "😕",
      "🙁",
      "😮",
      "😲",
      "🥺",
      "😢",
      "😭",
      "😱",
      "😤",
      "😡",
      "🤬",
      "😈",
      "💀",
      "👻",
      "🤖",
      "💩",
    ],
  },
  {
    label: "Gestures & People",
    emoji: [
      "👋",
      "🤚",
      "✋",
      "🖖",
      "👌",
      "🤌",
      "🤏",
      "✌️",
      "🤞",
      "🤟",
      "🤘",
      "👈",
      "👉",
      "👆",
      "👇",
      "☝️",
      "👍",
      "👎",
      "✊",
      "👊",
      "🤛",
      "🤜",
      "👏",
      "🙌",
      "👐",
      "🤲",
      "🙏",
      "💪",
      "🫡",
      "🙋",
      "🧑‍💻",
      "👀",
      "🗣️",
    ],
  },
  {
    label: "Hearts & Symbols",
    emoji: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "💔",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💘",
      "💝",
      "✅",
      "❌",
      "❗",
      "❓",
      "⭐",
      "🌟",
      "✨",
      "🔥",
      "💯",
      "💢",
      "💥",
      "💫",
      "🎉",
      "🎊",
    ],
  },
  {
    label: "Animals & Nature",
    emoji: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐸",
      "🐵",
      "🙈",
      "🙉",
      "🙊",
      "🐔",
      "🐧",
      "🦆",
      "🦉",
      "🐴",
      "🦄",
      "🐝",
      "🦋",
      "🐢",
      "🐍",
      "🐙",
      "🦀",
      "🐬",
      "🐳",
      "🌸",
      "🌼",
      "🌻",
      "🌈",
      "☀️",
      "⛅",
      "☁️",
      "⚡",
      "❄️",
    ],
  },
  {
    label: "Food & Drink",
    emoji: [
      "🍏",
      "🍎",
      "🍊",
      "🍋",
      "🍌",
      "🍉",
      "🍇",
      "🍓",
      "🍒",
      "🍑",
      "🍍",
      "🥭",
      "🥝",
      "🍅",
      "🥑",
      "🍕",
      "🍔",
      "🍟",
      "🌭",
      "🍿",
      "🧁",
      "🍩",
      "🍪",
      "🎂",
      "🍫",
      "🍬",
      "🍭",
      "☕",
      "🍵",
      "🧃",
      "🍺",
      "🍷",
      "🥂",
    ],
  },
  {
    label: "Activities & Objects",
    emoji: [
      "⚽",
      "🏀",
      "🏈",
      "⚾",
      "🎾",
      "🏐",
      "🎱",
      "🏆",
      "🎮",
      "🎲",
      "🎯",
      "🎸",
      "🎨",
      "📷",
      "💻",
      "📱",
      "⌚",
      "💡",
      "🔑",
      "🔒",
      "📌",
      "✏️",
      "📚",
      "🎁",
      "💰",
      "💳",
      "🚀",
      "✈️",
      "🚗",
      "🏠",
      "⏰",
    ],
  },
];

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  /** Pass the bare button, not wrapped in a Tooltip: Tooltip's Root doesn't forward the Slot props
   *  a nested trigger needs, so this wraps it itself when `tooltip` is set. */
  trigger?: ReactNode;
  tooltip?: string;
  align?: "start" | "center" | "end";
}

export function EmojiPicker({
  onPick,
  trigger,
  tooltip,
  align = "end",
}: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  const triggerButton = trigger ?? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-foreground flex-shrink-0"
    >
      <Smile className="w-4 h-4" />
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      )}
      <PopoverContent align={align} className="w-80 p-0 bg-card border-border">
        <ScrollArea className="h-72">
          <div className="p-2.5 space-y-3">
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-1">
                  {group.label}
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {group.emoji.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        onPick(e);
                        setOpen(false);
                      }}
                      className="text-lg leading-none p-1.5 rounded-md hover:bg-secondary/60 transition-colors"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
