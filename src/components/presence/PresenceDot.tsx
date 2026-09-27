import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PresenceDotProps {
  isActive: boolean;
  className?: string;
}

export function PresenceDot({ isActive, className }: PresenceDotProps) {
  return (
    <span
      className={cn(
        "absolute bottom-0 right-0 w-2 h-2 rounded-full border-[1.5px] border-card",
        isActive ? "bg-emerald-500" : "bg-zinc-500",
        className,
      )}
    >
      {isActive && (
        <motion.span
          className="absolute inset-0 rounded-full bg-emerald-500"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </span>
  );
}
