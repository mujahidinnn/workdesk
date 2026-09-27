import { lazy, Suspense, type ReactNode } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { PageFallback } from "./components/layout/PageFallback";

// Pages are split per route: the login screen should not ship the chat,
// the Excel writer and the PDF writer along with it.
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const DailyReportPage = lazy(() => import("./pages/DailyReportPage"));
const MasterHubPage = lazy(() => import("./pages/MasterHubPage"));
const TimelinePage = lazy(() => import("./pages/TimelinePage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const AttendancePage = lazy(() => import("./pages/AttendancePage"));
const LeavePage = lazy(() => import("./pages/LeavePage"));
const IssuesPage = lazy(() => import("./pages/IssuesPage"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const ProfileSettingsPage = lazy(() => import("./pages/ProfileSettingsPage"));
const GuidePage = lazy(() => import("./pages/GuidePage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const OvertimePage = lazy(() => import("./pages/OvertimePage"));
const PayrollPage = lazy(() => import("./pages/PayrollPage"));
const SuperadminPage = lazy(() => import("./pages/SuperadminPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const ForbiddenPage = lazy(() => import("./pages/ForbiddenPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const load = (element: ReactNode) => (
  <Suspense fallback={<PageFallback />}>{element}</Suspense>
);

/** Page behind both the auth check and a feature permission. */
const guarded = (featureKey: string, element: ReactNode) => (
  <ProtectedRoute featureKey={featureKey}>{load(element)}</ProtectedRoute>
);

export const routers = [
  { path: "/login", element: load(<LoginPage />) },
  { path: "/reset-password", element: load(<ResetPasswordPage />) },
  { path: "/403", element: load(<ForbiddenPage />) },

  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: guarded("dashboard", <DashboardPage />) },
          {
            path: "daily-report",
            element: guarded("daily-report", <DailyReportPage />),
          },
          { path: "timeline", element: guarded("timeline", <TimelinePage />) },
          { path: "calendar", element: guarded("holidays", <CalendarPage />) },
          {
            path: "attendance",
            element: guarded("attendance", <AttendancePage />),
          },
          { path: "leave", element: guarded("leave", <LeavePage />) },
          { path: "issues", element: guarded("issues", <IssuesPage />) },
          {
            path: "overtime",
            element: guarded("overtime-business-trip", <OvertimePage />),
          },
          // Read is granted to every role: staff reach their own payslip here,
          // and RLS is what limits them to it.
          { path: "payroll", element: guarded("payroll", <PayrollPage />) },
          { path: "export", element: guarded("export", <ExportPage />) },
          { path: "master", element: guarded("master", <MasterHubPage />) },
          // No featureKey: the sidebar entry and the page both check is_superadmin,
          // and so does every RPC it calls.
          { path: "superadmin", element: load(<SuperadminPage />) },
          // No featureKey: chat is open to every authenticated user, like Discord.
          { path: "chat", element: load(<ChatPage />) },
          // No featureKey: every authenticated user manages their own profile.
          { path: "settings/profile", element: load(<ProfileSettingsPage />) },
          // No featureKey: the guide is visible to every authenticated user.
          { path: "guide", element: load(<GuidePage />) },
        ],
      },
    ],
  },

  { path: "*", element: load(<NotFound />) },
];
