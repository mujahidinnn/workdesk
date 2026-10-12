import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import { useBoardCtx } from "./BoardContext";

export function PeoplePicker({
  selected,
  onToggle,
  isLocked,
  trigger,
}: {
  selected: string[];
  onToggle: (userId: string, on: boolean) => void;
  isLocked?: (userId: string) => boolean;
  trigger: ReactNode;
}) {
  const { data } = useBoardCtx();
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="max-h-72 overflow-y-auto">
          {data.members.map((m) => {
            const on = selected.includes(m.user_id);
            const locked = on && isLocked?.(m.user_id);
            return (
              <button
                key={m.user_id}
                type="button"
                disabled={locked}
                onClick={() => onToggle(m.user_id, !on)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted",
                  locked && "opacity-50",
                )}
              >
                <UserAvatar name={m.profile?.full_name ?? "?"} avatarUrl={m.profile?.avatar_url} size="xs" />
                <span className="flex-1 truncate text-left">{m.profile?.full_name}</span>
                {on && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
