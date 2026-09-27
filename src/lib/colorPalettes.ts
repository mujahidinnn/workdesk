/** Rotating colors for the initials chip on an avatar. */
export const AVATAR_CHIP_COLORS = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-400",
  "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-400",
  "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400",
  "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-400",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-400",
] as const;

export const ROLE_BADGE_COLORS: Record<string, string> = {
  Admin:
    "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-900/40",
  Manager:
    "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900/40",
  Employee:
    "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900/40",
};

/** Picked by index so a project keeps the same color everywhere. */
export const PROJECT_BADGE_COLORS = [
  "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800/40",
  "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800/40",
  "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800/40",
  "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-400 dark:border-cyan-800/40",
  "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800/40",
  "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800/40",
] as const;
