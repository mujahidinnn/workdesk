import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ROLE_BADGE_COLORS } from "@/lib/colorPalettes";
import { cn } from "@/lib/utils";
import type { UserWithEmail } from "@/lib/types";

interface MembersPanelProps {
  members: UserWithEmail[];
  onClickMember: (userId: string) => void;
}

export function MembersPanel({ members, onClickMember }: MembersPanelProps) {
  const { t } = useTranslation();
  const sorted = [...members].sort((a, b) =>
    (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email),
  );

  return (
    <div className="hidden lg:flex w-60 flex-shrink-0 flex-col border-l border-border">
      <div className="h-14 flex-shrink-0 flex items-center px-4 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {t("chat.members")} ({members.length})
        </p>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-2 py-2 divide-y divide-border/60">
          {sorted.map((m) => (
            <button
              key={m.id}
              onClick={() => onClickMember(m.id)}
              className="w-full flex items-center gap-2.5 px-2 py-2 hover:bg-secondary/60 text-left transition-colors"
            >
              <UserAvatar
                name={m.full_name ?? m.email}
                avatarUrl={m.avatar_url}
                size="sm"
                presenceUserId={m.id}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {m.full_name ?? m.email}
                </p>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  {m.role_name && (
                    <span
                      className={cn(
                        "inline-block text-[9px] font-semibold uppercase tracking-wide px-1.5 rounded-full border",
                        ROLE_BADGE_COLORS[m.role_name] ??
                          "bg-secondary text-muted-foreground border-border",
                      )}
                    >
                      {m.role_name}
                    </span>
                  )}
                  {m.employee_role_title && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {m.employee_role_title}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
