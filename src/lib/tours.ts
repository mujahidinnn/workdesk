/**
 * Tour steps keyed like guide.tours.<key>, targeting `[data-tour]` attributes.
 * `clickFirst` clicks another data-tour id first, e.g. to switch tabs.
 */
export interface TourStepConfig {
  selector: string;
  clickFirst?: string;
  /** Fixed side: an auto-picked side can flip between adjacent targets and make the step transition stumble. */
  side?: "top" | "right" | "bottom" | "left";
}

export const TOUR_STEPS: Record<string, TourStepConfig[]> = {
  dashboard: [
    { selector: "dashboard-stat-total", side: "right" },
    { selector: "dashboard-stat-progress", side: "right" },
    { selector: "dashboard-stat-completed", side: "right" },
    { selector: "dashboard-stat-problems", side: "left" },
    { selector: "dashboard-chart" },
    { selector: "dashboard-gauge" },
    { selector: "dashboard-problems" },
    { selector: "dashboard-workload" },
  ],
  "daily-report": [
    { selector: "daily-report-search" },
    { selector: "daily-report-filter" },
    { selector: "daily-report-add" },
    { selector: "daily-report-view" },
  ],
  timeline: [
    { selector: "timeline-view" },
    { selector: "timeline-search" },
    { selector: "timeline-gantt" },
  ],
  holidays: [
    { selector: "calendar-sync" },
    { selector: "calendar-grid" },
    { selector: "calendar-add" },
    { selector: "calendar-list" },
  ],
  attendance: [
    { selector: "attendance-tabs" },
    { selector: "attendance-period" },
    {
      selector: "attendance-content-myRecap",
      clickFirst: "attendance-tabbtn-myRecap",
    },
    {
      selector: "attendance-content-all",
      clickFirst: "attendance-tabbtn-all",
    },
    { selector: "attendance-add", clickFirst: "attendance-tabbtn-manage" },
    {
      selector: "attendance-schedule",
      clickFirst: "attendance-tabbtn-manage",
    },
    { selector: "attendance-table", clickFirst: "attendance-tabbtn-manage" },
  ],
  issues: [
    { selector: "issues-chips" },
    { selector: "issues-toolbar" },
    { selector: "issues-list" },
  ],
  "overtime-business-trip": [
    { selector: "overtime-new" },
    { selector: "overtime-stats", side: "bottom" },
    { selector: "overtime-chartline" },
    { selector: "overtime-tabs" },
    {
      selector: "overtime-content-myRequests",
      clickFirst: "overtime-tabbtn-myRequests",
    },
    {
      selector: "overtime-content-approval",
      clickFirst: "overtime-tabbtn-approval",
    },
    { selector: "overtime-content-rates", clickFirst: "overtime-tabbtn-rates" },
  ],
  export: [
    { selector: "export-daterange" },
    { selector: "export-fields" },
    { selector: "export-preview" },
    { selector: "export-buttons" },
    { selector: "export-overtime" },
  ],
  master: [
    {
      selector: "master-content-proj-types",
      clickFirst: "master-tabbtn-proj-types",
    },
    {
      selector: "master-proj-types-add",
      clickFirst: "master-tabbtn-proj-types",
    },
    {
      selector: "master-proj-types-search",
      clickFirst: "master-tabbtn-proj-types",
    },
    {
      selector: "master-content-proj-status",
      clickFirst: "master-tabbtn-proj-status",
    },
    {
      selector: "master-proj-status-add",
      clickFirst: "master-tabbtn-proj-status",
    },
    {
      selector: "master-proj-status-search",
      clickFirst: "master-tabbtn-proj-status",
    },
    {
      selector: "master-content-projects",
      clickFirst: "master-tabbtn-projects",
    },
    {
      selector: "master-projects-toolbar",
      clickFirst: "master-tabbtn-projects",
    },
    {
      selector: "master-content-employees",
      clickFirst: "master-tabbtn-employees",
    },
    {
      selector: "master-employees-toolbar",
      clickFirst: "master-tabbtn-employees",
    },
    { selector: "master-content-users", clickFirst: "master-tabbtn-users" },
    { selector: "master-users-toolbar", clickFirst: "master-tabbtn-users" },
    {
      selector: "master-content-audit-log",
      clickFirst: "master-tabbtn-audit-log",
    },
    {
      selector: "master-audit-log-search",
      clickFirst: "master-tabbtn-audit-log",
    },
  ],
  profile: [
    { selector: "profile-avatar" },
    { selector: "profile-account" },
    { selector: "profile-email" },
    { selector: "profile-personal" },
    { selector: "profile-language" },
    { selector: "profile-security" },
  ],
  notifications: [{ selector: "notification-bell" }],
  theme: [{ selector: "user-menu" }],
  logout: [{ selector: "user-menu" }],
};
