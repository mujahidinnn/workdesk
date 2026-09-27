import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, ShieldAlert, Trash2, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import { useJobTitles } from "@/hooks/useJobTitles";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import {
  ActivityChart,
  type ActivityBucket,
} from "@/components/superadmin/ActivityChart";
import {
  MonitorPanels,
  type Monitor,
} from "@/components/superadmin/MonitorPanels";

interface Stats {
  tables: Record<string, number>;
  accounts: {
    id: string;
    full_name: string | null;
    email: string;
    role: string | null;
    is_superadmin: boolean;
    banned: boolean;
    last_sign_in_at: string | null;
  }[];
  recent_audit: {
    id: number;
    action: string;
    entity_type: string;
    entity_id: string | null;
    created_at: string;
  }[];
  activity: ActivityBucket[];
}

/** Deliberately hidden (no sidebar entry, no feature key); its RPCs refuse non-superadmins. */
export default function SuperadminPage() {
  const { isSuperadmin, isLoading } = useAuth();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<"wipe" | "seed" | null>(null);
  const jobTitles = useJobTitles();

  const stats = useQuery<Stats>({
    queryKey: ["superadmin-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
    enabled: isSuperadmin(),
    refetchInterval: 30_000,
  });

  const monitor = useQuery<Monitor>({
    queryKey: ["superadmin-monitor"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_monitor");
      if (error) throw error;
      return data as unknown as Monitor;
    },
    enabled: isSuperadmin(),
    refetchInterval: 60_000,
  });

  const run = useMutation({
    mutationFn: async (fn: "superadmin_wipe_all_data" | "superadmin_seed_demo_data") => {
      const { error } = await supabase.rpc(fn);
      if (error) throw error;
    },
    onSuccess: (_d, fn) => {
      qc.invalidateQueries();
      toast.success(
        fn === "superadmin_wipe_all_data" ? "All data deleted" : "Default data created",
      );
      setConfirm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return null;
  if (!isSuperadmin()) return <Navigate to="/403" replace />;

  const tables = Object.entries(stats.data?.tables ?? {}).filter(([, n]) => n > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-500" />
          <h1 className="text-lg font-semibold">Superadmin</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
            stats.refetch();
            monitor.refetch();
          }}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {tables.map(([name, n]) => (
          <div key={name} className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground truncate">{name}</p>
            <p className="text-xl font-semibold tabular-nums">{n}</p>
          </div>
        ))}
      </section>

      {monitor.data && <MonitorPanels m={monitor.data} />}

      <section>
        <h2 className="text-sm font-medium mb-2">Accounts</h2>
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {(stats.data?.accounts ?? []).map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1 truncate">
                {a.full_name ?? "-"}{" "}
                {jobTitles.byUser(a.id) && (
                  <span className="text-xs text-muted-foreground">
                    · {jobTitles.byUser(a.id)}{" "}
                  </span>
                )}
                <span className="text-muted-foreground">{a.email}</span>
              </span>
              <span className="text-xs text-muted-foreground">{a.role ?? "-"}</span>
              {a.is_superadmin && (
                <span className="text-xs text-rose-600 dark:text-rose-500">superadmin</span>
              )}
              {a.banned && <span className="text-xs text-amber-700 dark:text-amber-500">banned</span>}
              <span className="text-xs text-muted-foreground w-36 text-right">
                {a.last_sign_in_at
                  ? new Date(a.last_sign_in_at).toLocaleString()
                  : "never signed in"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2">Event activity · last 14 days</h2>
        <div className="rounded-lg border border-border bg-card p-3">
          <ActivityChart buckets={stats.data?.activity ?? []} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2">Recent activity</h2>
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {(stats.data?.recent_audit ?? []).map((a) => (
            <div key={a.id} className="flex gap-3 px-3 py-1.5 text-xs">
              <span className="text-muted-foreground w-36 shrink-0">
                {new Date(a.created_at).toLocaleString()}
              </span>
              <span className="flex-1 truncate">
                {a.action} {a.entity_type} {a.entity_id ?? ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <Button
          variant="destructive"
          onClick={() => setConfirm("wipe")}
          disabled={run.isPending}
        >
          <Trash2 className="w-4 h-4 mr-1.5" />
          Delete all data
        </Button>
        <Button
          variant="outline"
          onClick={() => setConfirm("seed")}
          disabled={run.isPending}
        >
          <Database className="w-4 h-4 mr-1.5" />
          Reset to default data
        </Button>
      </section>

      <DeleteConfirmationModal
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "seed" ? "Reset to default data" : "Delete all data"}
        description={
          confirm === "seed"
            ? "Wipes everything, then recreates the demo company: accounts, projects, tasks, attendance, leave, overtime and chat. Your superadmin account stays."
            : "Deletes every project, task, attendance, leave, overtime, payroll, chat and employee record, and every account except yours. There is no undo."
        }
        isPending={run.isPending}
        onConfirm={() =>
          run.mutate(
            confirm === "seed"
              ? "superadmin_seed_demo_data"
              : "superadmin_wipe_all_data",
          )
        }
      />
    </div>
  );
}
