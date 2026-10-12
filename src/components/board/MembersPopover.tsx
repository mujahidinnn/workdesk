import { Link } from "react-router-dom";
import { ExternalLink, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/auth";
import { useSetMemberRole } from "@/hooks/useBoard";
import { isBoardPic } from "@/lib/taskPermissions";
import type { MemberRole } from "@/lib/types";
import { useBoardCtx } from "./BoardContext";
import { AvatarStack } from "./AvatarStack";

const ROLES: MemberRole[] = ["pic", "reviewer", "member"];

export function MembersPopover() {
  const { t } = useTranslation();
  const { canUpdate } = useAuth();
  const { boardId, data, access } = useBoardCtx();
  const setRole = useSetMemberRole(boardId, data.board.project_id);
  const canEdit = isBoardPic(access) || canUpdate("master");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-2">
          <AvatarStack userIds={data.members.map((m) => m.user_id)} max={5} />
          <Users className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-1 p-2">
        <p className="px-1 pb-1 text-xs text-muted-foreground">{t("board.members.hint")}</p>
        {canUpdate("master") && (
          <Link
            to={`/master?tab=projects&project=${data.board.project_id}`}
            className="mb-1 flex items-center gap-1.5 rounded px-1 py-1 text-xs font-medium text-primary hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("board.members.manage")}
          </Link>
        )}
        {data.members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-2 rounded px-1 py-1">
            <UserAvatar name={m.profile?.full_name ?? "?"} avatarUrl={m.profile?.avatar_url} size="sm" />
            <span className="flex-1 truncate text-sm">{m.profile?.full_name}</span>
            <Select
              disabled={!canEdit}
              value={m.member_role}
              onValueChange={(role) => setRole.mutate({ userId: m.user_id, role: role as MemberRole })}
            >
              <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">{t(`board.roles.${r}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
