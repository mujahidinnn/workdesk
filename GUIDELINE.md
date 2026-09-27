# Code Guideline

How code is organised here and where to put new code. What the app does and
how to run it live in `README.md`.

## AI Agent Rules

- **No AI slop design**: no generic, bloated or repetitive UI. Minimal, tailored Tailwind components over copy-pasted UI kits.
- **No AI writer tone**: commits, PRs, comments and docs in plain human tone. No em-dashes, no fluff, no robotic transitions.
- **Token efficiency**: minimal diffs, never rewrite unchanged files. YAGNI. Reuse existing helpers before writing new ones.

## Layout

```
src/
  components/    one folder per feature, ui/ for shared primitives
  context/       auth.tsx, theme.tsx
  hooks/         one data-access hook per file
  integrations/  generated Supabase client and types
  lib/           pure helpers, no React
  locales/       i18next translations
  pages/         route-level pages, flat files named <Feature>Page.tsx
  router.tsx     route table and permission guards
  App.tsx        global providers
  main.tsx       entry point
supabase/
  migrations/    schema, RLS policies, triggers
  functions/     edge functions
  tests/         security_smoke.sql
```

## Feature Modules

Each feature keeps its page in `src/pages/`, its data access in hook files in
`src/hooks/`, and its pieces in a folder under `src/components/`. Shared
calculations live in `src/lib/`.

| Feature | Page | Hooks | Components |
| --- | --- | --- | --- |
| Dashboard | `DashboardPage.tsx` | `useDailyTasks`, `useHrisSummary` | `components/dashboard/` |
| Daily report | `DailyReportPage.tsx` | `useDailyTasks` | `components/daily-report/` |
| Timeline | `TimelinePage.tsx` | `useDailyTasks`, `useTaskComments` | reuses `daily-report/` |
| Issues | `IssuesPage.tsx` | `useDailyTasks`, `useEmployees` | reuses `daily-report/` |
| Attendance | `AttendancePage.tsx` | `useAttendance`, `useWorkSchedule` | `components/attendance/` |
| Leave | `LeavePage.tsx` | `useLeaveRequests` | `components/leave/` |
| Overtime & trips | `OvertimePage.tsx` | `useOvertimeRecords` | `components/overtime/` |
| Payroll | `PayrollPage.tsx` | `usePayroll` | `components/payroll/` |
| Work calendar | `CalendarPage.tsx` | `useHolidays` | `components/calendar/` |
| Chat | `ChatPage.tsx` | `useChat` | `components/chat/` |
| Master data | `MasterHubPage.tsx` | `useEmployees`, `useProjects`, `useUsers` | `components/master-hub/` |
| Export | `ExportPage.tsx` | reuses the hooks above | - |
| Auth | `LoginPage.tsx`, `ResetPasswordPage.tsx` | `context/auth` | `components/auth/` |
| Profile, guide | `ProfileSettingsPage.tsx`, `GuidePage.tsx` | `usePermissions` | `components/layout/` |
| Superadmin | `SuperadminPage.tsx` | `context/auth` | - |

Shared helpers worth knowing before writing a new one: `lib/attendance.ts`
(late, early leave, hours worked), `lib/workday.ts` (working days, period
ranges), `lib/period.ts` (period filtering by date prefix),
`lib/permissions.ts` (role and override merge), `lib/payroll.ts` (gross pay
recap per employee).

## Adding Code

- **Page**: add `src/pages/<Feature>Page.tsx`, register it in `src/router.tsx`
  with `guarded("<feature key>", ...)` if it needs a permission, `load(...)` if
  any signed-in user may open it.
- **Component**: put it in the feature folder under `src/components/`,
  or `components/ui/` if more than one feature uses it. One responsibility per
  file, under 100 lines where practical.
- **Hook**: one file per hook in `src/hooks/`, named `use<Thing>.ts`.
- **Utility**: `src/lib/`, pure functions, no React imports.

Naming: `PascalCase` for components and pages, `camelCase` for hooks and
utilities. Update this file's table when you add or remove a page or feature
hook.

## Database Rules Live in the Database

Ownership, approval rules, the period lock, the clock stamps and the audit
trail are enforced by RLS policies and triggers, not by the UI. The UI only
hides actions the database would refuse. The rules live in
`supabase/migrations/`, with runnable proof in `supabase/tests/security_smoke.sql`
and, for payroll, `supabase/tests/payroll_smoke.sql`. When you add a rule that protects data,
add it there and add a case to the matching test.

Payroll in particular: a run's earnings come from `generate_payroll_run()`,
never from an insert by the client, and finalizing a run freezes every
amount on it. Deductions are optional and capped at what was earned.

## Tests

`pnpm test:run` for a single pass. Vitest, node environment, no jsdom. What is
covered is the pure logic where a silent mistake costs money or misstates
attendance (`lib/attendance.ts`, `lib/workday.ts`, `lib/period.ts`,
`lib/permissions.ts`, `lib/payroll.ts`, `calcDurationHours`,
`countLeaveWorkingDays`). Add a case
there when you touch one of those. Database rules are proved by the SQL smoke
test above, not by these.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server on port 8080 |
| `pnpm build` | Type check, then production build to `dist/` |
| `pnpm preview` | Serve the built `dist/` |
| `pnpm lint` | ESLint over the repo |
| `pnpm test` | Vitest in watch mode |
| `pnpm test:run` | Vitest, single pass |

## Deployment Notes

- `.env` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, both
  public (RLS protects the data). The app fails at startup if either is
  missing. Set the same two on Vercel.
- Requests go through `/supabase-api` (`vite.config.ts` in dev, `vercel.json`
  in production) so the app calls its own origin. The `vercel.json` rewrite
  hardcodes the Supabase host; update it if the project ref changes.
- The canonical, `og:url` and `og:image` URLs in `index.html` are hardcoded to
  `https://workdesk.mujahidin.my.id`; change them if the domain changes.
