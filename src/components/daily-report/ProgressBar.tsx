import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function ProgressBar({
  value,
  showLabel = true,
  size = "md",
}: ProgressBarProps) {
  const color =
    value === 100
      ? "bg-emerald-500"
      : value >= 75
        ? "bg-emerald-600"
        : value >= 50
          ? "bg-amber-500"
          : value >= 25
            ? "bg-amber-600"
            : "bg-red-500";

  const textColor =
    value === 100
      ? "text-emerald-600 dark:text-emerald-400"
      : value >= 75
        ? "text-emerald-700 dark:text-emerald-500"
        : value >= 50
          ? "text-amber-600 dark:text-amber-400"
          : value >= 25
            ? "text-amber-700 dark:text-amber-500"
            : "text-red-600 dark:text-red-400";

  return (
    <div className="flex items-center gap-2.5 w-full min-w-0">
      <div
        className={cn(
          "flex-1 bg-secondary rounded-full overflow-hidden",
          size === "sm" ? "h-1.5" : "h-2",
        )}
      >
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
        />
      </div>
      {showLabel && (
        <span
          className={cn(
            "text-xs font-semibold tabular-nums w-8 text-right flex-shrink-0",
            textColor,
          )}
        >
          {value}%
        </span>
      )}
    </div>
  );
}
