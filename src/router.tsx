import { lazy, Suspense, type ReactNode } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { PageFallback } from "./components/layout/PageFallback";
import { RouteError } from "./components/layout/ErrorBoundary";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const DailyReportPage = lazy(() => import("./pages/DailyReportPage"));
const BoardsPage = lazy(() => import("./pages/BoardsPage"));
const BoardPage = lazy(() => import("./pages/BoardPage"));
const MyTasksPage = lazy(() => import("./pages/MyTasksPage"));
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

const guarded = (featureKey: string, element: ReactNode) => (
  <ProtectedRoute featureKey={featureKey}>{load(element)}</ProtectedRoute>
);

export const routers = [
  { path: "/login", element: load(<LoginPage />), errorElement: <RouteError /> },
  {
    path: "/reset-password",
    element: load(<ResetPasswordPage />),
    errorElement: <RouteError />,
  },
  { path: "/403", element: load(<ForbiddenPage />), errorElement: <RouteError /> },

  {
    path: "/",
    element: <ProtectedRoute />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: guarded("dashboard", <DashboardPage />) },
          {
            path: "daily-report",
            element: guarded("daily-report", <DailyReportPage />),
          },
          { path: "boards", element: guarded("board", <BoardsPage />) },
          { path: "boards/:boardId", element: guarded("board", <BoardPage />) },
          { path: "my-tasks", element: guarded("board", <MyTasksPage />) },
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
          { path: "superadmin", element: load(<SuperadminPage />) },
          { path: "chat", element: load(<ChatPage />) },
          { path: "settings/profile", element: load(<ProfileSettingsPage />) },
          { path: "guide", element: load(<GuidePage />) },
        ],
      },
    ],
  },

  { path: "*", element: load(<NotFound />) },
];
