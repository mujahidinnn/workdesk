import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderKanban,
  Users,
  Tag,
  ListChecks,
  UserCog,
  History,
  Download,
  Upload,
  Plus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProjectsTable } from "@/components/master-hub/ProjectsTable";
import { ProjectsKanban } from "@/components/master-hub/ProjectsKanban";
import { EmployeesTable } from "@/components/master-hub/EmployeesTable";
import { MasterListTable } from "@/components/master-hub/MasterListTable";
import { MasterListFormDialog } from "@/components/master-hub/MasterListFormDialog";
import { UserManagement } from "@/components/master-hub/UserManagement";
import { AuditLogTable } from "@/components/master-hub/AuditLogTable";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import {
  SectionHeader,
  Toolbar,
  SearchInput,
} from "@/components/master-hub/MasterSection";
import { ImportDialog } from "@/components/master-hub/ImportDialog";
import { Button } from "@/components/ui/button";
import { AccessControl } from "@/components/auth/AccessControl";
import { exportProjectsExcel } from "@/lib/exportMasterData";
import { useWorkSchedule } from "@/hooks/useWorkSchedule";
import { parseProjectsExcel } from "@/lib/importMasterData";
import { ViewSwitcher, type ViewMode } from "@/components/ViewSwitcher";
import {
  ProjectFormDialog,
  type ProjectFormValues,
} from "@/components/master-hub/ProjectFormDialog";
import {
  EmployeeFormDialog,
  type EmployeeFormValues,
} from "@/components/master-hub/EmployeeFormDialog";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import {
  useProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  type ProjectFilters,
  type ProjectPayload,
} from "@/hooks/useProjects";
import {
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  type EmployeeFilters,
} from "@/hooks/useEmployees";
import {
  useProjectTypes,
  useCreateProjectType,
  useUpdateProjectType,
  useDeleteProjectType,
} from "@/hooks/useProjectTypes";
import {
  useWorkStatuses,
  useCreateWorkStatus,
  useUpdateWorkStatus,
  useDeleteWorkStatus,
} from "@/hooks/useWorkStatuses";
import { useDailyTasks } from "@/hooks/useDailyTasks";
import { useUsers } from "@/hooks/useUsers";
import { useEmployeePresence } from "@/hooks/useEmployeePresence";
import { useAuth } from "@/context/auth";
import { useTabParam } from "@/hooks/useTabParam";
import type { Project, Employee } from "@/lib/types";
import { cn } from "@/lib/utils";

type DeleteTargetType = "project" | "employee" | "type" | "status";
interface DeleteTarget {
  type: DeleteTargetType;
  id: number;
  label: string;
}

type TabId =
  | "projects"
  | "employees"
  | "proj-types"
  | "proj-status"
  | "users"
  | "audit-log";

const statusDot = (label: string): string => {
  const map: Record<string, string> = {
    MOU: "bg-sky-400",
    Requirement: "bg-purple-400",
    Cancel: "bg-red-400",
    "Client Review": "bg-amber-400",
    Quotation: "bg-cyan-400",
    Done: "bg-emerald-400",
    Development: "bg-indigo-400",
  };
  return map[label] ?? "bg-muted-foreground";
};

export default function MasterHubPage() {
  const { t } = useTranslation();
  const company = useWorkSchedule().data?.company_name ?? "WorkDesk";
  const [projectView, setProjectView] = useState<ViewMode>("table");
  const { isAdmin } = useAuth();

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // Ordered by setup dependency, not click frequency: taxonomies a Project
  // needs to exist first (Project Types, Project Status), then the entities
  // that reference them (Projects, Employees), then account access last.
  const ALL_TABS = [
    {
      id: "proj-types" as TabId,
      labelKey: "master.tabs.projectTypes",
      icon: Tag,
      adminOnly: false,
    },
    {
      id: "proj-status" as TabId,
      labelKey: "master.tabs.projectStatus",
      icon: ListChecks,
      adminOnly: false,
    },
    {
      id: "projects" as TabId,
      labelKey: "master.tabs.projects",
      icon: FolderKanban,
      adminOnly: false,
    },
    {
      id: "employees" as TabId,
      labelKey: "master.tabs.employees",
      icon: Users,
      adminOnly: false,
    },
    {
      id: "users" as TabId,
      labelKey: "master.tabs.users",
      icon: UserCog,
      adminOnly: true,
    },
    {
      id: "audit-log" as TabId,
      labelKey: "master.tabs.auditLog",
      icon: History,
      adminOnly: true,
    },
  ];

  const tabs = ALL_TABS.filter((tab) => !tab.adminOnly || isAdmin());
  const [activeTab, setActiveTab] = useTabParam(
    tabs.map((tab) => tab.id),
    "projects",
  );

  // On phones the tab bar scrolls sideways: keep the active tab in view.
  useEffect(() => {
    document
      .querySelector(`[data-tour="master-tabbtn-${activeTab}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab]);

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectFilters, setProjectFilters] = useState<ProjectFilters>({});
  const { data: allProjects = [] } = useProjects();
  const { data: projects = [], isLoading: projectsLoading } =
    useProjects(projectFilters);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectImportOpen, setProjectImportOpen] = useState(false);
  const visibleProjects = useMemo(() => {
    const q = projectSearch.toLowerCase().trim();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.project_code.toLowerCase().includes(q) ||
        p.project_name.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q),
    );
  }, [projects, projectSearch]);
  const { data: projectTypes = [] } = useProjectTypes();
  const { data: workStatuses = [] } = useWorkStatuses();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const { data: users = [] } = useUsers();

  const [empDialogOpen, setEmpDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeFilters, setEmployeeFilters] = useState<EmployeeFilters>(
    {},
  );
  const { data: allEmployees = [] } = useEmployees();
  const { data: employees = [], isLoading: employeesLoading } =
    useEmployees(employeeFilters);
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();

  const { isLoading: typesLoading } = useProjectTypes();
  const createType = useCreateProjectType();
  const updateType = useUpdateProjectType();
  const deleteType = useDeleteProjectType();
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<{
    id: number;
    label: string;
  } | null>(null);

  const { isLoading: statusesLoading } = useWorkStatuses();
  const createStatus = useCreateWorkStatus();
  const updateStatus = useUpdateWorkStatus();
  const deleteStatus = useDeleteWorkStatus();
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<{
    id: number;
    label: string;
  } | null>(null);

  const { data: presenceMap = {} } = useEmployeePresence();

  const { data: tasks = [] } = useDailyTasks();
  const projectProgress = useMemo<Record<number, number>>(() => {
    const sums: Record<number, { total: number; count: number }> = {};
    tasks.forEach((task) => {
      if (!sums[task.project_id])
        sums[task.project_id] = { total: 0, count: 0 };
      sums[task.project_id].total += task.progress_pct;
      sums[task.project_id].count += 1;
    });
    const result: Record<number, number> = {};
    Object.entries(sums).forEach(([id, { total, count }]) => {
      result[Number(id)] = Math.round(total / count);
    });
    return result;
  }, [tasks]);

  const handleProjectSubmit = (data: ProjectFormValues) => {
    if (editingProject) {
      updateProject.mutate(
        { id: editingProject.id, ...data },
        { onSuccess: () => setProjectDialogOpen(false) },
      );
    } else {
      createProject.mutate(data, {
        onSuccess: () => setProjectDialogOpen(false),
      });
    }
  };

  const handleEmployeeSubmit = (data: EmployeeFormValues) => {
    if (editingEmployee) {
      updateEmployee.mutate(
        { id: editingEmployee.id, ...data },
        { onSuccess: () => setEmpDialogOpen(false) },
      );
    } else {
      createEmployee.mutate(data, { onSuccess: () => setEmpDialogOpen(false) });
    }
  };

  const handleTypeSubmit = (label: string) => {
    if (editingType) {
      updateType.mutate(
        { id: editingType.id, type_name: label },
        { onSuccess: () => setTypeDialogOpen(false) },
      );
    } else {
      createType.mutate(label, { onSuccess: () => setTypeDialogOpen(false) });
    }
  };

  const handleStatusSubmit = (label: string) => {
    if (editingStatus) {
      updateStatus.mutate(
        { id: editingStatus.id, status_name: label },
        { onSuccess: () => setStatusDialogOpen(false) },
      );
    } else {
      createStatus.mutate(label, {
        onSuccess: () => setStatusDialogOpen(false),
      });
    }
  };

  const requestDelete = (type: DeleteTargetType, id: number, label: string) => {
    setDeleteTarget({ type, id, label });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    switch (deleteTarget.type) {
      case "project":
        deleteProject.mutate(deleteTarget.id);
        break;
      case "employee":
        deleteEmployee.mutate(deleteTarget.id);
        break;
      case "type":
        deleteType.mutate(deleteTarget.id);
        break;
      case "status":
        deleteStatus.mutate(deleteTarget.id);
        break;
    }
    setDeleteTarget(null);
  };

  const deletePending =
    deleteProject.isPending ||
    deleteEmployee.isPending ||
    deleteType.isPending ||
    deleteStatus.isPending;

  const getDeleteModal = () => {
    if (!deleteTarget) return { title: "", description: "" };
    switch (deleteTarget.type) {
      case "project":
        return {
          title: t("master.projects.deleteTitle"),
          description: t("master.projects.deleteDesc", {
            name: deleteTarget.label,
          }),
        };
      case "employee":
        return {
          title: t("master.employees.deleteTitle"),
          description: t("master.employees.deleteDesc", {
            name: deleteTarget.label,
          }),
        };
      case "type":
        return {
          title: t("master.masterList.deleteTypeTitle"),
          description: t("master.masterList.deleteTypeDesc", {
            name: deleteTarget.label,
          }),
        };
      case "status":
        return {
          title: t("master.masterList.deleteStatusTitle"),
          description: t("master.masterList.deleteStatusDesc", {
            name: deleteTarget.label,
          }),
        };
    }
  };

  const tabCount = (id: TabId) => {
    if (id === "projects") return allProjects.length;
    if (id === "employees") return allEmployees.length;
    if (id === "proj-types") return projectTypes.length;
    if (id === "proj-status") return workStatuses.length;
    return null;
  };

  const { title: modalTitle, description: modalDesc } = getDeleteModal();

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div
        data-tour="master-tabs"
        className="flex items-center gap-1 p-1 bg-segment rounded-xl border border-border w-fit max-w-full overflow-x-auto scrollbar-thin"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-tour={`master-tabbtn-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 transition-all duration-200",
              activeTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="tab-bg"
                className="absolute inset-0 bg-card rounded-lg border border-border shadow-sm"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <tab.icon
              className={cn(
                "w-4 h-4 relative z-10",
                activeTab === tab.id ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="relative z-10">{t(tab.labelKey)}</span>
            {tabCount(tab.id) !== null && (
              <span
                className={cn(
                  "relative z-10 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-md text-[10px] font-semibold tabular-nums",
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "bg-card text-muted-foreground dark:bg-secondary",
                )}
              >
                {tabCount(tab.id)}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          data-tour={`master-content-${activeTab}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {activeTab === "projects" && (
            <div className="flex flex-col gap-4">
              <SectionHeader
                title={t("master.projects.title")}
                count={visibleProjects.length}
                subtitle={t("master.projects.subtitle")}
                tour="master-projects-toolbar"
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportProjectsExcel(visibleProjects, company)}
                      disabled={visibleProjects.length === 0}
                      className="h-8 gap-1.5 border-border text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t("common.export")}
                    </Button>
                    <AccessControl feature="master" action="create">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setProjectImportOpen(true)}
                        className="h-8 gap-1.5 border-border text-xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {t("master.import.button")}
                      </Button>
                    </AccessControl>
                    <AccessControl feature="master" action="create">
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditingProject(null);
                          setProjectDialogOpen(true);
                        }}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t("master.projects.newProject")}
                      </Button>
                    </AccessControl>
                  </>
                }
              />

              <Toolbar
                end={
                  <ViewSwitcher view={projectView} onChange={setProjectView} />
                }
              >
                <SearchInput
                  value={projectSearch}
                  onChange={setProjectSearch}
                  placeholder={t("master.projects.search")}
                />
                <FilterSelect
                  value={projectFilters.statusId}
                  onChange={(statusId) =>
                    setProjectFilters((f) => ({ ...f, statusId }))
                  }
                  allLabel={t("master.filters.allStatuses")}
                  options={workStatuses.map((s) => ({
                    value: String(s.id),
                    label: s.status_name,
                  }))}
                />
                <FilterSelect
                  value={projectFilters.typeId}
                  onChange={(typeId) =>
                    setProjectFilters((f) => ({ ...f, typeId }))
                  }
                  allLabel={t("master.filters.allTypes")}
                  options={projectTypes.map((tp) => ({
                    value: String(tp.id),
                    label: tp.type_name,
                  }))}
                />
                <FilterSelect
                  value={projectFilters.priority}
                  onChange={(priority) =>
                    setProjectFilters((f) => ({ ...f, priority }))
                  }
                  allLabel={t("master.filters.allPriorities")}
                  options={["High", "Medium", "Low"].map((p) => ({
                    value: p,
                    label: p,
                  }))}
                />
              </Toolbar>

              <AnimatePresence mode="wait">
                <motion.div
                  key={projectView}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {projectView === "table" ? (
                    <ProjectsTable
                      projects={visibleProjects}
                      onEdit={(p) => {
                        setEditingProject(p);
                        setProjectDialogOpen(true);
                      }}
                      onDelete={(id) => {
                        const proj = projects.find((p) => p.id === id);
                        requestDelete(
                          "project",
                          id,
                          proj?.project_name ?? String(id),
                        );
                      }}
                      isLoading={projectsLoading}
                      isFiltered={
                        !!projectSearch.trim() ||
                        Object.values(projectFilters).some(Boolean)
                      }
                    />
                  ) : (
                    <ProjectsKanban
                      projects={visibleProjects}
                      onEdit={(p) => {
                        setEditingProject(p);
                        setProjectDialogOpen(true);
                      }}
                      onDelete={(id) => {
                        const proj = projects.find((p) => p.id === id);
                        requestDelete(
                          "project",
                          id,
                          proj?.project_name ?? String(id),
                        );
                      }}
                      isLoading={projectsLoading}
                      projectProgress={projectProgress}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {activeTab === "employees" && (
            <EmployeesTable
              employees={employees}
              onAdd={() => {
                setEditingEmployee(null);
                setEmpDialogOpen(true);
              }}
              onEdit={(e) => {
                setEditingEmployee(e);
                setEmpDialogOpen(true);
              }}
              onDelete={(id) => {
                const emp = employees.find((e) => e.id === id);
                requestDelete("employee", id, emp?.full_name ?? String(id));
              }}
              isLoading={employeesLoading}
              presenceMap={presenceMap}
              filters={employeeFilters}
              onFiltersChange={setEmployeeFilters}
            />
          )}

          {activeTab === "proj-types" && (
            <MasterListTable
              tourId="proj-types"
              title={t("master.masterList.projectTypes.title")}
              subtitle={t("master.masterList.projectTypes.subtitle")}
              itemLabel={t("master.masterList.projectTypes.itemLabel")}
              icon={Tag}
              items={projectTypes.map((tp) => ({
                id: tp.id,
                label: tp.type_name,
              }))}
              onAdd={() => {
                setEditingType(null);
                setTypeDialogOpen(true);
              }}
              onEdit={(item) => {
                setEditingType(item);
                setTypeDialogOpen(true);
              }}
              onDelete={(id) => {
                const item = projectTypes.find((tp) => tp.id === id);
                requestDelete("type", id, item?.type_name ?? String(id));
              }}
              isLoading={typesLoading}
            />
          )}

          {activeTab === "proj-status" && (
            <MasterListTable
              tourId="proj-status"
              title={t("master.masterList.projectStatus.title")}
              subtitle={t("master.masterList.projectStatus.subtitle")}
              itemLabel={t("master.masterList.projectStatus.itemLabel")}
              icon={ListChecks}
              items={workStatuses.map((s) => ({
                id: s.id,
                label: s.status_name,
              }))}
              colorDot={statusDot}
              onAdd={() => {
                setEditingStatus(null);
                setStatusDialogOpen(true);
              }}
              onEdit={(item) => {
                setEditingStatus(item);
                setStatusDialogOpen(true);
              }}
              onDelete={(id) => {
                const item = workStatuses.find((s) => s.id === id);
                requestDelete("status", id, item?.status_name ?? String(id));
              }}
              isLoading={statusesLoading}
            />
          )}

          {activeTab === "users" && <UserManagement />}

          {activeTab === "audit-log" && <AuditLogTable />}
        </motion.div>
      </AnimatePresence>

      <ProjectFormDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={editingProject}
        projectTypes={projectTypes}
        workStatuses={workStatuses}
        users={users}
        onSubmit={handleProjectSubmit}
        loading={createProject.isPending || updateProject.isPending}
      />
      <ImportDialog<ProjectPayload>
        open={projectImportOpen}
        onOpenChange={setProjectImportOpen}
        onParse={(file) => parseProjectsExcel(file, workStatuses, projectTypes)}
        onImport={async (rows) => {
          await Promise.all(rows.map((row) => createProject.mutateAsync(row)));
        }}
      />
      <EmployeeFormDialog
        open={empDialogOpen}
        onOpenChange={setEmpDialogOpen}
        employee={editingEmployee}
        onSubmit={handleEmployeeSubmit}
        loading={createEmployee.isPending || updateEmployee.isPending}
      />
      <MasterListFormDialog
        open={typeDialogOpen}
        onOpenChange={setTypeDialogOpen}
        title={t("master.masterList.projectTypes.itemLabel")}
        initialValue={editingType?.label ?? null}
        onSubmit={handleTypeSubmit}
        loading={createType.isPending || updateType.isPending}
      />
      <MasterListFormDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        title={t("master.masterList.projectStatus.itemLabel")}
        initialValue={editingStatus?.label ?? null}
        onSubmit={handleStatusSubmit}
        loading={createStatus.isPending || updateStatus.isPending}
      />

      <DeleteConfirmationModal
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        title={modalTitle}
        description={modalDesc}
        onConfirm={handleDeleteConfirm}
        isPending={deletePending}
      />
    </div>
  );
}
