import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "default" | "emerald" | "amber" | "red";
  delay?: number;
}

const variantStyles = {
  default: {
    icon: "text-muted-foreground bg-secondary",
    value: "text-foreground",
  },
  emerald: {
    icon: "text-emerald-600 bg-emerald-100 dark:text-emerald-500 dark:bg-emerald-950",
    value: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    icon: "text-amber-600 bg-amber-100 dark:text-amber-500 dark:bg-amber-950",
    value: "text-amber-600 dark:text-amber-400",
  },
  red: {
    icon: "text-destructive bg-destructive/10",
    value: "text-destructive",
  },
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  delay = 0,
}: StatsCardProps) {
  const styles = variantStyles[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="glass-card rounded-xl p-3 sm:p-4 group h-full"
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">
            {title}
          </p>
          <p
            className={cn("text-xl sm:text-2xl font-bold mt-1.5 sm:mt-1 leading-none", styles.value)}
          >
            {value}
          </p>
          {subtitle && (
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1.5 leading-snug">
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={cn(
            "w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0",
            styles.icon,
          )}
        >
          <Icon className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" strokeWidth={2} />
        </div>
      </div>
    </motion.div>
  );
}
