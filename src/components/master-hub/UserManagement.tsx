import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Shield,
  ChevronRight,
  UserPlus,
  Trash2,
  Mail,
  RotateCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PermissionsDialog } from "./PermissionsDialog";
import { InviteUserDialog } from "./InviteUserDialog";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import {
  useUsers,
  type UserFilters,
  useUpdateUserRole,
  useUpdateUserEmployee,
  useDeleteUser,
  useReactivateUser,
} from "@/hooks/useUsers";
import { FilterSelect } from "./FilterSelect";
import { SectionHeader, Toolbar, SearchInput } from "./MasterSection";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import type { Profile, Role, Employee, UserWithEmail } from "@/lib/types";
import {
  AVATAR_CHIP_COLORS as avatarColors,
  ROLE_BADGE_COLORS as roleBadgeColors,
} from "@/lib/colorPalettes";
import { cn } from "@/lib/utils";

function getInitials(name: string | null) {
  return (name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function isBanned(bannedUntil: string | null): boolean {
  return !!bannedUntil && new Date(bannedUntil) > new Date();
}

function useRoles() {
  return useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_roles")
        .select("*")
        .order("id");
      if (error) throw error;
      return data as Role[];
    },
    staleTime: Infinity,
  });
}

function useEmployees() {
  return useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_employees")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data as Employee[];
    },
  });
}

export function UserManagement() {
  const { t } = useTranslation();
  const { user: currentUser, profile: currentProfile } = useAuth();
  const myRank = currentProfile?.role?.rank ?? Number.MAX_SAFE_INTEGER;
  const [filters, setFilters] = useState<UserFilters>({});
  const { data: users = [], isLoading } = useUsers(filters);
  const { data: roles = [] } = useRoles();
  const { data: employees = [] } = useEmployees();
  const updateRole = useUpdateUserRole();
  const updateEmployee = useUpdateUserEmployee();
  const deleteUser = useDeleteUser();
  const reactivateUser = useReactivateUser();

  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<UserWithEmail | null>(null);
  const [viewing, setViewing] = useState<UserWithEmail | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q),
    );
  }, [users, search]);

  const handleRevokeConfirm = () => {
    if (!revokeTarget) return;
    deleteUser.mutate(revokeTarget.id, {
      onSettled: () => setRevokeTarget(null),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("master.users.title")}
        count={users.length}
        subtitle={t("master.users.subtitle")}
        tour="master-users-toolbar"
        actions={
          <Button
            size="sm"
            onClick={() => setInviteOpen(true)}
            className="h-8 text-xs"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            {t("master.users.inviteUser")}
          </Button>
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("master.users.search")}
        />

          <FilterSelect
            value={filters.roleId}
            onChange={(roleId) => setFilters((f) => ({ ...f, roleId }))}
            allLabel={t("master.filters.allRoles")}
            options={roles.map((r) => ({
              value: String(r.id),
              label: r.role_name,
            }))}
          />
          <FilterSelect
            value={filters.linked}
            onChange={(linked) => setFilters((f) => ({ ...f, linked }))}
            allLabel={t("master.filters.allLinks")}
            options={[
              { value: "linked", label: t("master.filters.linked") },
              { value: "unlinked", label: t("master.filters.unlinked") },
            ]}
          />
      </Toolbar>

      <div className="rounded-xl border border-border bg-card overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              {[
                t("master.users.columns.user"),
                t("master.users.columns.role"),
                t("master.users.columns.linkedEmployee"),
                t("master.users.columns.joined"),
                t("master.users.columns.permissions"),
                "",
              ].map((h, idx) => (
                <th
                  key={idx}
                  className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-secondary animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4">
                  <EmptyState
                    icon={Users}
                    title={
                      search
                        ? t("master.users.noUsersSearch")
                        : t("master.users.noUsers")
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((user, i) => {
                const roleName = user.role_name ?? "";
                const badgeCls =
                  roleBadgeColors[roleName] ??
                  "bg-secondary text-muted-foreground border-border";

                // Only someone outranking the target's role may change it (not self or peers).
                // Mirrors guard_profile_role_change().
                const targetRank =
                  roles.find((r) => r.id === user.role_id)?.rank ??
                  Number.MAX_SAFE_INTEGER;
                const isSelf = user.id === currentUser?.id;
                const canChangeRole = !isSelf && myRank < targetRank;
                const roleOptions = canChangeRole
                  ? roles.filter((r) => myRank < r.rank)
                  : roles;

                const profileShape: Profile = {
                  id: user.id,
                  full_name: user.full_name,
                  role_id: user.role_id,
                  employee_id: user.employee_id,
                  avatar_url: user.avatar_url,
                  language_preference: null,
                  is_superadmin: false,
                  phone_number: null,
                  created_at: user.created_at,
                  role: user.role_id
                    ? {
                        id: user.role_id,
                        role_name: user.role_name ?? "",
                        rank: targetRank,
                      }
                    : null,
                };

                return (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    {...detailRowProps(() => setViewing(user))}
                    className="border-b border-border/40 group hover:bg-secondary/40 transition-colors cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0",
                            avatarColors[i % avatarColors.length],
                          )}
                        >
                          {getInitials(user.full_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate max-w-[140px] flex items-center gap-1.5">
                            {user.full_name ?? "-"}
                            {isBanned(user.banned_until) && (
                              <span className="text-[9px] font-semibold uppercase tracking-wide text-rose-700 bg-rose-100 border border-rose-300 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-900/40 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                {t("master.users.revoked")}
                              </span>
                            )}
                          </p>
                          {user.employee_role_title && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                              {user.employee_role_title}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate max-w-[140px]">
                            <Mail className="w-2.5 h-2.5 flex-shrink-0" />
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Select
                        value={user.role_id?.toString() ?? ""}
                        disabled={!canChangeRole}
                        onValueChange={(val) =>
                          updateRole.mutate({
                            userId: user.id,
                            roleId: Number(val),
                          })
                        }
                      >
                        <SelectTrigger
                          className={cn(
                            "w-32 h-7 text-[11px] font-semibold border px-2 rounded-full disabled:opacity-100",
                            badgeCls,
                          )}
                          title={
                            isSelf
                              ? t("master.users.cannotChangeSelf")
                              : !canChangeRole
                                ? t("master.users.cannotChangeRole")
                                : undefined
                          }
                        >
                          <div className="flex items-center gap-1.5">
                            <Shield className="w-2.5 h-2.5 flex-shrink-0" />
                            <SelectValue
                              placeholder={t("master.users.assignRole")}
                            />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {roleOptions.map((r) => (
                            <SelectItem
                              key={r.id}
                              value={r.id.toString()}
                              className="text-xs"
                            >
                              {r.role_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Select
                        value={user.employee_id?.toString() ?? "none"}
                        onValueChange={(val) =>
                          updateEmployee.mutate({
                            userId: user.id,
                            employeeId: val !== "none" ? Number(val) : null,
                          })
                        }
                      >
                        <SelectTrigger className="w-40 h-7 text-xs bg-secondary border-border rounded-lg">
                          <SelectValue
                            placeholder={t("master.users.notLinked")}
                          />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem
                            value="none"
                            className="text-xs text-muted-foreground"
                          >
                            {t("master.users.notLinked")}
                          </SelectItem>
                          {employees.map((e) => (
                            <SelectItem
                              key={e.id}
                              value={String(e.id)}
                              className="text-xs"
                            >
                              {e.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {new Date(user.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </td>

                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => setSelectedUser(profileShape)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        {t("master.users.permissions")}
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>

                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isBanned(user.banned_until) ? (
                        <button
                          onClick={() => reactivateUser.mutate(user.id)}
                          disabled={reactivateUser.isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-950/30 transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                          title={t("master.users.reactivate")}
                        >
                          <RotateCcw className="w-3 h-3" />
                          {t("master.users.reactivate")}
                        </button>
                      ) : (
                        <button
                          onClick={() => setRevokeTarget(user)}
                          disabled={deleteUser.isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-950/30 transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                          title={t("master.users.revoke")}
                        >
                          <Trash2 className="w-3 h-3" />
                          {t("master.users.revoke")}
                        </button>
                      )}
                    </td>
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      {selectedUser && (
        <PermissionsDialog
          user={selectedUser}
          open={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}

      <DetailDialog
        title={t("common.detail")}
        fields={viewing && detailFields(viewing, t)}
        onClose={() => setViewing(null)}
      />

      <DeleteConfirmationModal
        open={!!revokeTarget}
        onOpenChange={(v) => {
          if (!v) setRevokeTarget(null);
        }}
        title={t("master.users.revokeTitle")}
        description={t("master.users.revokeDesc", {
          name: revokeTarget?.full_name ?? revokeTarget?.email ?? "",
        })}
        onConfirm={handleRevokeConfirm}
        isPending={deleteUser.isPending}
      />
    </div>
  );
}

function detailFields(u: UserWithEmail, t: (k: string) => string): DetailField[] {
  return [
    { label: t("master.users.columns.user"), value: u.full_name },
    { label: t("profile.fields.email"), value: u.email },
    {
      label: t("master.users.columns.role"),
      value: u.role_name && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
            roleBadgeColors[u.role_name] ??
              "bg-secondary text-muted-foreground border-border",
          )}
        >
          <Shield className="w-2.5 h-2.5 flex-shrink-0" />
          {u.role_name}
        </span>
      ),
    },
    {
      label: t("master.users.columns.linkedEmployee"),
      value: u.employee_name ?? t("master.users.notLinked"),
    },
    {
      label: t("master.employees.fields.roleTitle"),
      value: u.employee_role_title,
    },
    {
      label: t("master.users.columns.joined"),
      value: new Date(u.created_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    },
    {
      label: t("master.employees.columns.status"),
      value: isBanned(u.banned_until) && (
        <span className="text-[9px] font-semibold uppercase tracking-wide text-rose-700 bg-rose-100 border border-rose-300 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-900/40 px-1.5 py-0.5 rounded-full">
          {t("master.users.revoked")}
        </span>
      ),
    },
  ];
}
