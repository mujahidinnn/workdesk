/** Plain-language names for the raw table / audit identifiers the superadmin RPCs return. */

/** table → [label, description] */
const TABLES: Record<string, [string, string]> = {
  m_divisions: ["Divisions", "Teams such as Backend, Frontend or QA that task steps are handed to."],
  m_employees: ["Employees", "Employee master data: name, position, status, join date."],
  m_features: ["App features", "Menus of the app (Attendance, Chat, …) that role permissions are set on."],
  m_holidays: ["Holidays", "National and company holidays, used for attendance and leave counts."],
  m_project_members: ["Project memberships", "Which employee is part of which project."],
  m_project_types: ["Project types", "Categories of projects, e.g. Software, Hardware, Mapping."],
  m_projects: ["Projects", "Projects the company is working on."],
  m_roles: ["Roles", "Roles such as Admin or Staff that decide what someone can access."],
  m_work_schedule: ["Work schedule settings", "Company work hours, work days and the payroll lock date."],
  m_work_status: ["Work statuses", "Project stages, e.g. Requirement, Development, Client Review, Done."],
  profiles: ["User accounts", "Login accounts. Each is usually linked to one employee."],
  project_type_assignment: ["Project type links", "Links between projects and their project types."],
  t_attendance: ["Attendance records", "Daily check-in / check-out records of every employee."],
  t_audit_log: ["Activity history", "Log of every create, change and delete made in the app."],
  t_board_columns: ["Board columns", "Columns (stages) inside each task board, e.g. To do, Done."],
  t_board_order: ["Board ordering", "Each user's own ordering of the task board list."],
  t_board_task_attachments: ["Board task files", "Files attached to tasks on task boards."],
  t_board_task_comments: ["Board task comments", "Comments written on tasks on task boards."],
  t_boards: ["Task boards", "Kanban boards, one per project, holding that project's tasks."],
  t_chat_attachments: ["Chat files", "Files and images sent in chat."],
  t_chat_channel_reads: ["Chat read markers", "Marks up to which message each person has read a channel."],
  t_chat_channels: ["Chat channels", "Chat rooms: group channels and direct messages."],
  t_chat_message_reactions: ["Chat reactions", "Emoji reactions on chat messages."],
  t_chat_messages: ["Chat messages", "All chat messages sent between users."],
  t_chat_poll_votes: ["Chat poll votes", "Votes given on polls inside chat."],
  t_daily_tasks: ["Daily tasks", "Daily work reports filled in by employees."],
  t_employee_rates: ["Salary rates", "Salary and allowance rates per employee, used by payroll."],
  t_error_log: ["Error reports", "Errors users ran into, including failed sign-ins."],
  t_leave_requests: ["Leave requests", "Leave applications (annual, sick, etc.) and their approval."],
  t_notifications: ["Notifications", "Notifications shown to users in the bell icon."],
  t_overtime_business_trips: ["Overtime & business trips", "Overtime and business trip requests and their approval."],
  t_payroll_lines: ["Payslip lines", "Per-employee salary details inside each payroll period."],
  t_payroll_runs: ["Payroll periods", "Monthly payroll periods, draft or finalized."],
  t_role_permissions: ["Role permissions", "What each role may view, create, edit or delete."],
  t_task_activity: ["Task history", "History of changes on each task (moved, assigned, etc.)."],
  t_task_assignees: ["Task assignees", "Who is assigned to which task."],
  t_task_attachments: ["Task files", "Files attached to tasks."],
  t_task_comments: ["Task comments", "Comments written on tasks."],
  t_task_label_map: ["Task label links", "Which labels are attached to which task."],
  t_task_labels: ["Task labels", "Colored labels/tags used to group tasks."],
  t_task_reviewers: ["Task reviewers", "Who must review a task before it is done."],
  t_task_reviews: ["Task reviews", "Review results (approved / needs changes) on tasks."],
  t_task_steps: ["Task steps", "Checklist steps inside a task."],
  t_tasks: ["Tasks", "Tasks on task boards."],
  t_user_access_override: ["Per-user access", "Special access given to one user, outside their role."],
};

const ENTITIES: Record<string, string> = {
  access_override: "per-user access",
  attendance: "attendance",
  daily_task: "daily task",
  employee: "employee",
  holiday: "holiday",
  leave: "leave request",
  overtime: "overtime / business trip",
  payroll_line: "payslip line",
  payroll_run: "payroll period",
  profile: "user account",
  project: "project",
  role_permission: "role permission",
  user: "user",
  user_role: "user role",
  work_schedule: "work schedule",
};

const VERBS: Record<string, string> = {
  insert: "Created",
  create: "Created",
  update: "Changed",
  delete: "Deleted",
};

const humanize = (s: string) => s.replace(/^[mt]_/, "").replace(/[_-]+/g, " ");

export const tableLabel = (t: string) => TABLES[t]?.[0] ?? humanize(t);
export const tableDescription = (t: string) => TABLES[t]?.[1] ?? null;
export const entityLabel = (e: string) => ENTITIES[e] ?? humanize(e);
export const actionLabel = (a: string) => VERBS[a] ?? humanize(a);

/** "Created leave request", "Changed user account". */
export const describeChange = (action: string, entity: string) =>
  `${actionLabel(action)} ${entityLabel(entity)}`;
