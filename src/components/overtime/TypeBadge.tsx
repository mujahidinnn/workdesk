import { useTranslation } from "react-i18next";
import { Clock, MapPin, Plane } from "lucide-react";
import type { OvertimeType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<
  OvertimeType,
  {
    colorClass: string;
    Icon: React.ElementType;
  }
> = {
  Overtime: {
    colorClass:
      "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/30",
    Icon: Clock,
  },
  BusinessTrip_Local: {
    colorClass:
      "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/30",
    Icon: MapPin,
  },
  BusinessTrip_OutOfTown: {
    colorClass:
      "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/30",
    Icon: Plane,
  },
};

export function TypeBadge({ type }: { type: OvertimeType }) {
  const { t } = useTranslation();
  const { colorClass, Icon } = TYPE_CONFIG[type] ?? TYPE_CONFIG.Overtime;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap",
        colorClass,
      )}
    >
      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
      {t(`overtime.type.${type}`)}
    </span>
  );
}
