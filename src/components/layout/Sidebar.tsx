import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { LogoMark } from "@/components/brand/Logo";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth";
import { useNavGroups } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useMyTasks } from "@/hooks/useMyTasks";
import { useUnreadMentionCounts } from "@/hooks/useChat";

export function Sidebar() {
  const location = useLocation();
  const { canRead } = useAuth();
  const { t } = useTranslation();
  const navGroups = useNavGroups();
  const { data: myTasks } = useMyTasks();
  const { data: unread = {} } = useUnreadMentionCounts();
  const counts: Record<string, number> = {
    "/my-tasks":
      myTasks?.assigned.filter((task) => task.status !== "done").length ?? 0,
    "/chat": Object.values(unread).reduce((a, b) => a + b, 0),
  };

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="h-14 flex items-center px-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-6 w-auto flex-shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground leading-none">
              {t("app.name")}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
              {t("app.tagline")}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto scrollbar-thin">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.featureKey || canRead(item.featureKey),
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 mb-2">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.href);

                  return (
                    <NavLink key={item.href} to={item.href}>
                      <motion.div
                        whileHover={{ x: 2 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 group",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                        )}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="active-pill"
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full"
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 30,
                            }}
                          />
                        )}
                        <item.icon
                          className={cn(
                            "w-4 h-4 flex-shrink-0 transition-colors",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-foreground",
                          )}
                          strokeWidth={isActive ? 2.5 : 2}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-sm font-medium leading-none",
                              isActive ? "text-primary" : "",
                            )}
                          >
                            {item.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight truncate">
                            {item.description}
                          </p>
                        </div>
                        {(counts[item.href] ?? 0) > 0 && (
                          <span
                            className={cn(
                              "flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none flex items-center justify-center",
                              item.href === "/chat"
                                ? "bg-rose-500 text-white"
                                : "bg-primary/15 text-primary",
                            )}
                          >
                            {counts[item.href] > 99 ? "99+" : counts[item.href]}
                          </span>
                        )}
                      </motion.div>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <div className="px-3 py-2.5 rounded-lg bg-sidebar-accent">
          <p className="text-[11px] font-medium text-foreground">
            {t("app.footer")}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {t("app.version")}
          </p>
        </div>
      </div>
    </aside>
  );
}
