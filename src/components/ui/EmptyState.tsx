import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  size?: "default" | "sm";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  size = "default",
  className,
}: EmptyStateProps) {
  const isSmall = size === "sm";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isSmall ? "gap-2 py-6" : "gap-3 py-12",
        className,
      )}
    >
      <div
        className={cn(
          "rounded-2xl bg-gradient-to-b from-secondary to-secondary/40 border border-border/60 flex items-center justify-center",
          isSmall ? "w-10 h-10 rounded-xl" : "w-14 h-14",
        )}
      >
        <Icon
          className={cn(
            "text-muted-foreground/50",
            isSmall ? "w-4.5 h-4.5" : "w-6 h-6",
          )}
        />
      </div>
      <div className="space-y-1">
        <p
          className={cn(
            "font-medium text-foreground",
            isSmall ? "text-xs" : "text-sm",
          )}
        >
          {title}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground max-w-[280px] leading-snug">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
