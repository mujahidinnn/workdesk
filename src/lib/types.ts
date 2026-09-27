export interface ProjectType {
  id: number;
  type_name: string;
}

export interface WorkStatus {
  id: number;
  status_name: string;
}

export interface Project {
  id: number;
  project_code: string;
  project_name: string;
  client: string;
  pic_name?: string | null;
  pic_contact?: string | null;
  priority?: "Low" | "Medium" | "High";
  status_id?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  project_types?: ProjectType[];
  work_status?: WorkStatus | null;
  member_user_ids?: string[];
}

export const CLOSED_PROJECT_STATUSES = ["Done", "Cancel"];

export type EmploymentType = "Permanent" | "Contract" | "Probation" | "Intern";

export interface Employee {
  id: number;
  full_name: string;
  role_title: string;
  status: "Active" | "Inactive";
  employee_number: string | null;
  department: string | null;
  employment_type: EmploymentType;
  join_date: string | null;
  resign_date: string | null;
  annual_leave_quota: number;
  created_at: string;
}

export interface DailyTask {
  id: number;
  date: string;
  employee_id: number;
  project_id: number;
  task_desc: string;
  progress_pct: number;
  problem_desc: string | null;
  is_resolved: boolean;
  created_at: string;
}

export interface DailyTaskWithRelations extends DailyTask {
  employee: Employee;
  project: Project;
}

export interface DashboardSummary {
  totalTasks: number;
  avgProgress: number;
  activeProblems: number;
  completedTasks: number;
}

export interface Role {
  id: number;
  role_name: string;
  rank: number;
}

export interface Feature {
  id: number;
  feature_name: string;
  feature_key: string;
  icon_name: string | null;
  path: string | null;
}

export interface RolePermission {
  id: number;
  role_id: number;
  feature_id: number;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  feature?: Feature;
}

export interface UserOverride {
  id: number;
  user_id: string;
  feature_id: number;
  can_create: boolean | null;
  can_read: boolean | null;
  can_update: boolean | null;
  can_delete: boolean | null;
  is_override_active: boolean;
  feature?: Feature;
}

export interface Profile {
  id: string;
  role_id: number | null;
  employee_id: number | null;
  full_name: string | null;
  avatar_url: string | null;
  language_preference: string | null;
  phone_number: string | null;
  is_superadmin: boolean;
  created_at: string;
  role?: Role | null;
}

export interface FeaturePermission {
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}

export type PermissionMap = Record<string, FeaturePermission>;

export type OvertimeType =
  "Overtime" | "BusinessTrip_Local" | "BusinessTrip_OutOfTown";

export interface OvertimeRecord {
  id: number;
  user_id: string;
  type: OvertimeType;
  date: string;
  /** Day the shift ends. Same as date, or the next day for an overnight shift. */
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  project_id: number | null;
  activity_description: string;
  duration_hours: number | null;
  daily_allowance: number | null;
  status: "Pending" | "Approved" | "Rejected";
  approved_by: string | null;
  rejection_note: string | null;
  created_at: string;
}

export interface OvertimeRecordWithRelations extends OvertimeRecord {
  project: Pick<Project, "id" | "project_code" | "project_name"> | null;
  submitter: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

/** Aggregated monthly summary for chart */
export interface OvertimeMonthSummary {
  month: number; // 1-12
  label: string;
  overtimeHours: number;
  businessTripLocalDays: number;
  businessTripOutOfTownDays: number;
}

export type PayrollRunStatus = "Draft" | "Finalized";
export type PaymentStatus = "Unpaid" | "Paid";

export interface PayrollRun {
  id: number;
  /** First day of the month the run covers. */
  period: string;
  status: PayrollRunStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  finalized_by: string | null;
  finalized_at: string | null;
}

export interface PayrollLine {
  id: number;
  run_id: number;
  user_id: string;
  base_salary: number;
  overtime_hours: number;
  overtime_pay: number;
  local_trip_days: number;
  local_trip_pay: number;
  out_of_town_days: number;
  out_of_town_pay: number;
  pph21: number;
  bpjs: number;
  other_deduction: number;
  deduction_note: string | null;
  /** Both computed by the database, never sent from here. */
  gross: number;
  net: number;
  payment_status: PaymentStatus;
  paid_at: string | null;
}

/** What the payroll table and the payslip render: a line plus who it is for. */
export interface PayrollLineWithName extends PayrollLine {
  name: string;
  job_title?: string | null;
}

export interface EmployeeRate {
  id: number;
  profile_id: string;
  base_salary: number;
  overtime_rate: number;
  local_trip_rate: number;
  out_of_town_rate: number;
  updated_at: string;
  updated_by: string | null;
  profile?: Pick<Profile, "id" | "full_name"> | null;
}

/** Extended user row returned by get_users_with_email() RPC */
export interface UserWithEmail {
  id: string;
  full_name: string | null;
  email: string;
  role_id: number | null;
  role_name: string | null;
  employee_id: number | null;
  employee_name: string | null;
  /** Employee job title (m_employees.role_title), not the RBAC role in role_name. */
  employee_role_title: string | null;
  avatar_url: string | null;
  created_at: string;
  banned_until: string | null;
  is_superadmin: boolean;
}

export type ChatChannelType = "general" | "project" | "dm";

export interface ChatChannel {
  id: number;
  type: ChatChannelType;
  project_id: number | null;
  /** Thread name within a project's chat; null for its default channel. Always null for general/dm. */
  name: string | null;
  dm_user_a: string | null;
  dm_user_b: string | null;
  created_at: string;
}

export interface ChatAttachment {
  id: number;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  /** Signed URL resolved client-side at fetch time; the bucket is private. */
  url?: string | null;
}

export interface ChatReaction {
  id: number;
  emoji: string;
  user_id: string;
}

export interface ChatMessage {
  id: number;
  channel_id: number;
  sender_id: string;
  body: string;
  reply_to_id: number | null;
  mentions: string[];
  mentions_everyone: boolean;
  forwarded_from_sender_name: string | null;
  /** Set the first time the sender edits the body; drives the "edited" marker. */
  edited_at: string | null;
  pinned_at: string | null;
  pinned_by: string | null;
  created_at: string;
  attachments?: ChatAttachment[];
  reactions?: ChatReaction[];
  sender?: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

export interface Notification {
  id: number;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface TaskAttachment {
  id: number;
  task_id: number;
  file_path: string;
  file_name: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  user_id: string;
  comment: string;
  created_at: string;
}

export interface TaskCommentWithAuthor extends TaskComment {
  author: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

export interface AuditLogEntry {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogEntryWithActor extends AuditLogEntry {
  actor: Pick<Profile, "id" | "full_name"> | null;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  is_national: boolean;
  created_at: string;
}

export type AttendanceStatus = "Hadir" | "Izin" | "Sakit" | "Cuti" | "Alpa";

/** Statuses an employee picks themselves at check-in. Cuti and Alpa are derived. */
export const SELF_CHECK_IN_STATUSES: AttendanceStatus[] = [
  "Hadir",
  "Izin",
  "Sakit",
];

export interface Attendance {
  id: number;
  user_id: string;
  date: string;
  status: AttendanceStatus;
  clock_in: string | null;
  clock_out: string | null;
  note: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceWithProfile extends Attendance {
  profile: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
  /** Short-lived signed URL; the bucket is private. */
  attachment_url?: string | null;
}

/** Singleton company-wide work schedule used to flag late check-ins. */
export interface WorkSchedule {
  id: number;
  clock_in_time: string;
  clock_out_time: string;
  /** Printed on payslips. */
  company_name: string;
  late_tolerance_minutes: number;
  /** IANA zone the company clocks by, e.g. "Asia/Jakarta". */
  timezone: string;
  /** ISO weekday numbers that count as working days: 1 = Monday .. 7 = Sunday. */
  work_days: number[];
  /** Everything on or before this date is closed for edits. */
  locked_until: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type LeaveType = "Cuti" | "Izin" | "Sakit";
export type LeaveStatus = "Pending" | "Approved" | "Rejected";

export interface LeaveRequest {
  id: number;
  user_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  approved_by: string | null;
  rejection_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequestWithProfile extends LeaveRequest {
  submitter: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}
