import { MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserIdentityCard } from "./UserIdentityCard";
import type { UserWithEmail } from "@/lib/types";

interface UserProfileModalProps {
  user: UserWithEmail | null;
  /** Hides the "Message" action on your own profile. */
  myUserId?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onMessage?: (userId: string) => void;
}

export function UserProfileModal({
  user,
  myUserId,
  open,
  onOpenChange,
  onMessage,
}: UserProfileModalProps) {
  const { t } = useTranslation();
  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">{user.full_name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center gap-3 pt-2 pb-1">
          <UserIdentityCard user={user} avatarSize="lg" />

          {onMessage && user.id !== myUserId && (
            <Button
              size="sm"
              className="w-full gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => onMessage(user.id)}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t("chat.message")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
