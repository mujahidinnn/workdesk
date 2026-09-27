import { Mail, Briefcase } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ROLE_BADGE_COLORS } from "@/lib/colorPalettes";
import { cn } from "@/lib/utils";
import type { UserWithEmail } from "@/lib/types";

interface UserIdentityCardProps {
  user: UserWithEmail;
  avatarSize?: "md" | "lg";
}

/** Avatar + name + role/job badges + contact rows - the identity block shared by the full profile modal and the DM sidebar's "who am I talking to" panel. */
export function UserIdentityCard({
  user,
  avatarSize = "lg",
}: UserIdentityCardProps) {
  return (
    <div className="flex flex-col items-center text-center gap-3">
      <UserAvatar
        name={user.full_name ?? user.email}
        avatarUrl={user.avatar_url}
        size={avatarSize}
        className={
          avatarSize === "lg" ? "w-16 h-16 text-lg" : "w-11 h-11 text-sm"
        }
      />
      <div>
        <p className="text-sm font-semibold text-foreground">
          {user.full_name ?? user.email}
        </p>
        <div className="flex items-center justify-center gap-1.5 mt-1.5 flex-wrap">
          {user.role_name && (
            <span
              className={cn(
                "inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border",
                ROLE_BADGE_COLORS[user.role_name] ??
                  "bg-secondary text-muted-foreground border-border",
              )}
            >
              {user.role_name}
            </span>
          )}
          {user.employee_role_title && (
            <span className="text-[11px] text-muted-foreground">
              {user.employee_role_title}
            </span>
          )}
        </div>
      </div>

      <div className="w-full space-y-2 pt-2 border-t border-border text-left">
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground pt-2">
          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{user.email}</span>
        </div>
        {user.employee_name && (
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{user.employee_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
