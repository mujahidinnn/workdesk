import {
  LayoutDashboard,
  ClipboardList,
  Database,
  CalendarRange,
  CalendarDays,
  CalendarCheck,
  CalendarOff,
  AlertOctagon,
  Download,
  Clock,
  Compass,
  MessageCircle,
  Wallet,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Omit for pages every authenticated user can reach. */
  featureKey?: string;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Shared route list - feeds both the Sidebar and the command palette. */
export function useNavGroups(): NavGroup[] {
  const { t } = useTranslation();
  const { isSuperadmin } = useAuth();

  return [
    {
      label: t("nav.groups.navigation"),
      items: [
        {
          href: "/",
          label: t("nav.items.dashboard"),
          icon: LayoutDashboard,
          featureKey: "dashboard",
          description: t("nav.descriptions.dashboard"),
        },
        {
          href: "/daily-report",
          label: t("nav.items.dailyReport"),
          icon: ClipboardList,
          featureKey: "daily-report",
          description: t("nav.descriptions.dailyReport"),
        },
        {
          href: "/timeline",
          label: t("nav.items.timeline"),
          icon: CalendarRange,
          featureKey: "timeline",
          description: t("nav.descriptions.timeline"),
        },
        {
          href: "/calendar",
          label: t("nav.items.calendar"),
          icon: CalendarDays,
          featureKey: "holidays",
          description: t("nav.descriptions.calendar"),
        },
        {
          href: "/attendance",
          label: t("nav.items.attendance"),
          icon: CalendarCheck,
          featureKey: "attendance",
          description: t("nav.descriptions.attendance"),
        },
        {
          href: "/leave",
          label: t("nav.items.leave"),
          icon: CalendarOff,
          featureKey: "leave",
          description: t("nav.descriptions.leave"),
        },
        {
          href: "/chat",
          label: t("nav.items.chat"),
          icon: MessageCircle,
          description: t("nav.descriptions.chat"),
        },
      ],
    },
    {
      label: t("nav.groups.tools"),
      items: [
        {
          href: "/issues",
          label: t("nav.items.issueLog"),
          icon: AlertOctagon,
          featureKey: "issues",
          description: t("nav.descriptions.issueLog"),
        },
        {
          href: "/overtime",
          label: t("nav.items.overtime"),
          icon: Clock,
          featureKey: "overtime-business-trip",
          description: t("nav.descriptions.overtime"),
        },
        {
          href: "/payroll",
          label: t("nav.items.payroll"),
          icon: Wallet,
          featureKey: "payroll",
          description: t("nav.descriptions.payroll"),
        },
        {
          href: "/export",
          label: t("nav.items.export"),
          icon: Download,
          featureKey: "export",
          description: t("nav.descriptions.export"),
        },
      ],
    },
    {
      label: t("nav.groups.configuration"),
      items: [
        {
          href: "/master",
          label: t("nav.items.masterHub"),
          icon: Database,
          featureKey: "master",
          description: t("nav.descriptions.masterHub"),
        },
        // No featureKey: gated by is_superadmin instead of role permissions.
        ...(isSuperadmin()
          ? [
              {
                href: "/superadmin",
                label: t("nav.items.superadmin"),
                icon: ShieldCheck,
                description: t("nav.descriptions.superadmin"),
              },
            ]
          : []),
      ],
    },
    {
      label: t("nav.groups.help"),
      items: [
        {
          href: "/guide",
          label: t("nav.items.guide"),
          icon: Compass,
          description: t("nav.descriptions.guide"),
        },
      ],
    },
  ];
}
