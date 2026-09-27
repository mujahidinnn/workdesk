import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  ShieldCheck,
  UserCog,
  Monitor,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Sidebar } from "./Sidebar";
import { NotificationBell } from "./NotificationBell";
import { CommandPalette } from "./CommandPalette";
import { SignOutConfirmModal } from "./SignOutConfirmModal";
import { AttendanceGateModal } from "@/components/attendance/AttendanceGateModal";
import { useTheme } from "@/context/theme";
import { useAuth } from "@/context/auth";
import { useTrackPresence } from "@/hooks/useOnlineUsers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [chatSidebarHidden, setChatSidebarHidden] = useState(false);
  const location = useLocation();
  const isChat = location.pathname === "/chat";
  const desktopSidebarHidden = isChat && chatSidebarHidden;
  const navigate = useNavigate();
  const { preference, setPreference } = useTheme();
  const { user, profile, signOut, isAdmin } = useAuth();
  useTrackPresence(user?.id);
  const { t } = useTranslation();

  const PAGE_LABELS: Record<string, { titleKey: string; subtitleKey: string }> =
    {
      "/": {
        titleKey: "nav.items.dashboard",
        subtitleKey: "nav.descriptions.dashboard",
      },
      "/daily-report": {
        titleKey: "nav.items.dailyReport",
        subtitleKey: "nav.descriptions.dailyReport",
      },
      "/timeline": {
        titleKey: "nav.items.timeline",
        subtitleKey: "nav.descriptions.timeline",
      },
      "/calendar": {
        titleKey: "nav.items.calendar",
        subtitleKey: "nav.descriptions.calendar",
      },
      "/attendance": {
        titleKey: "nav.items.attendance",
        subtitleKey: "nav.descriptions.attendance",
      },
      "/chat": {
        titleKey: "nav.items.chat",
        subtitleKey: "nav.descriptions.chat",
      },
      "/leave": {
        titleKey: "nav.items.leave",
        subtitleKey: "nav.descriptions.leave",
      },
      "/overtime": {
        titleKey: "nav.items.overtime",
        subtitleKey: "nav.descriptions.overtime",
      },
      "/payroll": {
        titleKey: "nav.items.payroll",
        subtitleKey: "nav.descriptions.payroll",
      },
      "/superadmin": {
        titleKey: "nav.items.superadmin",
        subtitleKey: "nav.descriptions.superadmin",
      },
      "/issues": {
        titleKey: "nav.items.issueLog",
        subtitleKey: "nav.descriptions.issueLog",
      },
      "/export": {
        titleKey: "nav.items.export",
        subtitleKey: "nav.descriptions.export",
      },
      "/master": {
        titleKey: "nav.items.masterHub",
        subtitleKey: "nav.descriptions.masterHub",
      },
      "/settings/profile": {
        titleKey: "profile.title",
        subtitleKey: "profile.subtitle",
      },
      "/guide": {
        titleKey: "nav.items.guide",
        subtitleKey: "nav.descriptions.guide",
      },
    };

  const pageKeys = PAGE_LABELS[location.pathname];
  const pageTitle = pageKeys ? t(pageKeys.titleKey) : "WorkDesk";
  const pageSubtitle = pageKeys ? t(pageKeys.subtitleKey) : "";

  const initials = (profile?.full_name ?? "A")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const avatarUrl = profile?.avatar_url ?? null;

  return (
    <div className="flex h-full bg-background overflow-hidden">
      <CommandPalette onRequestSignOut={() => setSignOutConfirmOpen(true)} />
      <SignOutConfirmModal
        open={signOutConfirmOpen}
        onOpenChange={setSignOutConfirmOpen}
        onConfirm={signOut}
      />
      <AttendanceGateModal />

      <motion.div
        initial={false}
        animate={{ width: desktopSidebarHidden ? 0 : 240 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        inert={desktopSidebarHidden}
        className="hidden md:block flex-shrink-0 overflow-hidden"
      >
        <Sidebar />
      </motion.div>

      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-zinc-950/40 dark:bg-black/60 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="fixed left-0 top-0 h-full z-50 md:hidden"
            >
              <Sidebar />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 md:px-6 border-b border-border glass-card">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-none">
                {pageTitle}
              </h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-none hidden sm:block">
                {pageSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />

            {/* Rendered via Radix portal to avoid overflow/z-index clipping. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-tour="user-menu"
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-secondary transition-colors outline-none"
                >
                  <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Avatar"
                        loading="lazy"
                        decoding="async"
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-emerald flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white">
                          {initials}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-medium text-foreground hidden sm:block max-w-[100px] truncate">
                    {profile?.full_name ?? "User"}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-52 z-[9999] bg-card border-border shadow-elevated"
              >
                <DropdownMenuLabel className="font-normal px-3 py-2.5">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {profile?.full_name ?? "User"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {profile?.role?.role_name ?? "-"}
                  </p>
                </DropdownMenuLabel>

                {isAdmin() && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-rose-700 bg-rose-100 border border-rose-300 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-900/40 px-2 py-0.5 rounded-full">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        {t("shell.administrator")}
                      </span>
                    </div>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/settings/profile")}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-secondary focus:bg-secondary cursor-pointer"
                >
                  <UserCog className="w-3.5 h-3.5 text-muted-foreground" />
                  {t("shell.profileSettings")}
                </DropdownMenuItem>

                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-foreground">
                    {t("shell.theme")}
                  </span>
                  <div
                    role="radiogroup"
                    aria-label={t("shell.theme")}
                    className="flex items-center gap-0.5 p-0.5 rounded-md bg-secondary"
                  >
                    {(
                      [
                        ["light", Sun, "shell.themeLight"],
                        ["dark", Moon, "shell.themeDark"],
                        ["system", Monitor, "shell.themeSystem"],
                      ] as const
                    ).map(([value, Icon, labelKey]) => (
                      <button
                        key={value}
                        role="radio"
                        aria-checked={preference === value}
                        aria-label={t(labelKey)}
                        title={t(labelKey)}
                        onClick={() => setPreference(value)}
                        className={cn(
                          "p-1 rounded transition-colors",
                          preference === value
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setSignOutConfirmOpen(true)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-100 focus:text-rose-700 focus:bg-rose-100 dark:text-rose-400 dark:hover:text-rose-300 dark:focus:text-rose-300 dark:hover:bg-rose-950/30 dark:focus:bg-rose-950/30 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {t("shell.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main
          className={cn("flex-1 overflow-y-auto scrollbar-thin", "p-4 md:p-6")}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={isChat ? "h-full" : "min-h-full"}
            >
              <Outlet
                context={{
                  sidebarHidden: desktopSidebarHidden,
                  toggleSidebar: () => setChatSidebarHidden((v) => !v),
                }}
              />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
