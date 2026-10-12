import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBoardCtx } from "./BoardContext";

export function AvatarStack({ userIds, max = 4 }: { userIds: string[]; max?: number }) {
  const { t } = useTranslation();
  const { people } = useBoardCtx();
  const name = (id: string) => {
    const p = people.get(id);
    const full = p?.profile?.full_name ?? "?";
    return p?.left ? `${full} ${t("board.members.leftSuffix")}` : full;
  };
  const hidden = userIds.slice(max);
  return (
    <div className="flex -space-x-1">
      {userIds.slice(0, max).map((id) => (
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <UserAvatar
                name={name(id)}
                avatarUrl={people.get(id)?.profile?.avatar_url}
                size="xs"
                className="ring-2 ring-card"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{name(id)}</TooltipContent>
        </Tooltip>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="ml-2 text-[10px] text-muted-foreground">+{hidden.length}</span>
          </TooltipTrigger>
          <TooltipContent>{hidden.map(name).join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
