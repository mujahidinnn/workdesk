import { cn } from "@/lib/utils";
import { AVATAR_CHIP_COLORS as AVATAR_COLORS } from "@/lib/colorPalettes";
import { useIsOnline } from "@/hooks/useOnlineUsers";

/** Stable color derived from the name string so the same person always gets the same color */
function nameToColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % AVATAR_COLORS.length;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const SIZE = {
  xs: "w-5 h-5 text-[8px] rounded",
  sm: "w-6 h-6 text-[10px] rounded-md",
  md: "w-7 h-7 text-[11px] rounded-lg",
  lg: "w-9 h-9 text-xs rounded-xl",
} as const;

interface UserAvatarProps {
  /** Display name used for initials fallback and accessible alt text */
  name: string;
  /** Optional photo URL - shown as an image if provided */
  avatarUrl?: string | null;
  /** Override the automatic color index (e.g. pass `employee.id % 6`) */
  colorIndex?: number;
  size?: keyof typeof SIZE;
  className?: string;
  /** When set, shows a green dot while this user is online */
  presenceUserId?: string;
}

/**
 * Shared avatar component used everywhere in WorkDesk.
 * Shows a real photo when `avatarUrl` is set, otherwise renders
 * color-coded initials consistent across the whole app.
 */
export function UserAvatar({
  name,
  avatarUrl,
  colorIndex,
  size = "sm",
  className,
  presenceUserId,
}: UserAvatarProps) {
  const isOnline = useIsOnline(presenceUserId);
  const idx =
    colorIndex !== undefined
      ? colorIndex % AVATAR_COLORS.length
      : nameToColorIndex(name);

  const avatar = avatarUrl ? (
      <div
        className={cn("overflow-hidden flex-shrink-0", SIZE[size], className)}
      >
        <img
          src={avatarUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          crossOrigin="anonymous"
          className="w-full h-full object-cover"
        />
      </div>
  ) : (
    <div
      className={cn(
        "flex items-center justify-center font-bold flex-shrink-0 select-none",
        SIZE[size],
        AVATAR_COLORS[idx],
        className,
      )}
    >
      {getInitials(name)}
    </div>
  );

  if (!isOnline) return avatar;
  return (
    <div className="relative flex-shrink-0">
      {avatar}
      <span
        aria-label="Online"
        className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-card"
      />
    </div>
  );
}
