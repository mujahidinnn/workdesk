import { useTranslation } from "react-i18next";
import { UserIdentityCard } from "./UserIdentityCard";
import type { UserWithEmail } from "@/lib/types";

interface DmProfilePanelProps {
  otherUser: UserWithEmail;
  onClickProfile: (userId: string) => void;
}

/** Replaces the member list for a DM, where a two-person list is redundant. */
export function DmProfilePanel({
  otherUser,
  onClickProfile,
}: DmProfilePanelProps) {
  const { t } = useTranslation();

  return (
    <div className="hidden lg:flex w-60 flex-shrink-0 flex-col border-l border-border">
      <div className="h-14 flex-shrink-0 flex items-center px-4 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {t("chat.about")}
        </p>
      </div>
      <button
        onClick={() => onClickProfile(otherUser.id)}
        className="px-4 py-6 hover:bg-secondary/40 transition-colors text-left"
      >
        <UserIdentityCard user={otherUser} avatarSize="lg" />
      </button>
    </div>
  );
}
