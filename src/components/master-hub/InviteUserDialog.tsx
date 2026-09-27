import { useState, useEffect } from "react";
import { Eye, EyeOff, UserPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateUser, useUsers } from "@/hooks/useUsers";
import type { Employee, Role } from "@/lib/types";

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
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

const EMPLOYEE_ROLE_ID = 3;

export function InviteUserDialog({
  open,
  onOpenChange,
}: InviteUserDialogProps) {
  const { data: roles = [] } = useRoles();
  const { data: employees = [] } = useEmployees();
  const { data: users = [] } = useUsers();
  const createUser = useCreateUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState<string>(String(EMPLOYEE_ROLE_ID));
  const [employeeId, setEmployeeId] = useState<string>("none");

  useEffect(() => {
    if (open) {
      setEmail("");
      setPassword("");
      setFullName("");
      setRoleId(String(EMPLOYEE_ROLE_ID));
      setEmployeeId("none");
      setShowPwd(false);
    }
  }, [open]);

  const linkedEmployeeIds = new Set(
    users.map((u) => u.employee_id).filter(Boolean),
  );
  const unlinkedEmployees = employees.filter(
    (e) => !linkedEmployeeIds.has(e.id),
  );

  function handleEmployeeChange(val: string) {
    setEmployeeId(val);
    if (val !== "none") {
      const emp = employees.find((e) => e.id === Number(val));
      if (emp && !fullName) setFullName(emp.full_name);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password || !fullName || !roleId) return;

    await createUser.mutateAsync({
      email: email.trim(),
      password,
      full_name: fullName.trim(),
      role_id: Number(roleId),
      employee_id: employeeId !== "none" ? Number(employeeId) : null,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <UserPlus className="w-4 h-4 text-primary" />
            Invite User
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Create a login account for an employee. They can sign in
            immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground">
              Link to Employee{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Select value={employeeId} onValueChange={handleEmployeeChange}>
              <SelectTrigger className="text-sm bg-secondary border-border">
                <SelectValue placeholder="Select employee…" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem
                  value="none"
                  className="text-xs text-muted-foreground"
                >
                  - No employee link -
                </SelectItem>
                {unlinkedEmployees.map((e) => (
                  <SelectItem
                    key={e.id}
                    value={String(e.id)}
                    className="text-xs"
                  >
                    {e.full_name}
                    <span className="ml-1.5 text-muted-foreground">
                      · {e.role_title}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="invite-name"
              className="text-xs font-medium text-foreground"
            >
              Display Name{" "}
              <span className="text-rose-600 dark:text-rose-400">*</span>
            </Label>
            <Input
              id="invite-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. John Doe"
              required
              className="text-sm bg-secondary border-border"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="invite-email"
              className="text-xs font-medium text-foreground"
            >
              Email <span className="text-rose-600 dark:text-rose-400">*</span>
            </Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.com"
              required
              className="text-sm bg-secondary border-border"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="invite-pwd"
              className="text-xs font-medium text-foreground"
            >
              Temporary Password{" "}
              <span className="text-rose-600 dark:text-rose-400">*</span>
            </Label>
            <div className="relative">
              <Input
                id="invite-pwd"
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                minLength={8}
                required
                className="text-sm bg-secondary border-border pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPwd ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground">
              Role <span className="text-rose-600 dark:text-rose-400">*</span>
            </Label>
            <Select value={roleId} onValueChange={setRoleId} required>
              <SelectTrigger className="text-sm bg-secondary border-border">
                <SelectValue placeholder="Select role…" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {roles.map((r) => (
                  <SelectItem
                    key={r.id}
                    value={String(r.id)}
                    className="text-xs"
                  >
                    {r.role_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={createUser.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                createUser.isPending || !email || !password || !fullName
              }
            >
              {createUser.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Creating…
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Create Account
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
