import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import { useJobTitles } from "@/hooks/useJobTitles";

export interface Monitor {
  failed_logins: { email: string | null; message: string; created_at: string }[];
  inactive_accounts: {
    id: string;
    full_name: string | null;
    email: string;
    last_sign_in_at: string | null;
  }[];
  access_changes: {
    action: string;
    entity_type: string;
    entity_id: string;
    created_at: string;
    actor: string | null;
  }[];
  errors: {
    last_24h: number;
    recent: {
      source: string;
      message: string;
      created_at: string;
      user_name: string | null;
    }[];
  };
  orphans: {
    accounts_without_employee: string[];
    employees_without_account: string[];
    projects_without_members: string[];
  };
  storage: { bucket: string; files: number; bytes: number }[];
  attendance_today: { date: string; missing: string[]; recorded: number };
  stale_approvals: {
    kind: "leave" | "overtime";
    type: string;
    full_name: string | null;
    created_at: string;
  }[];
  payroll: {
    locked_until: string | null;
    runs: { period: string; status: string; finalized_at: string | null }[];
  };
  top_actors: { name: string; n: number }[];
  top_entities: { name: string; n: number }[];
  active_now: { name: string | null; last_at: string }[];
}

export const clickableRow =
  "cursor-pointer rounded hover:bg-secondary/40 outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50";

const when = (iso: string) => new Date(iso).toLocaleString();
const daysAgo = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

function bytes(n: number) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Amber when something needs a look, muted when the list is clean. */
function Panel({
  title,
  count,
  children,
  className,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3 flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {count !== undefined && (
          <span
            className={cn(
              "text-xs tabular-nums px-1.5 rounded",
              count > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-500" : "text-muted-foreground",
            )}
          >
            {count}
          </span>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto text-xs divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({
  left,
  right,
  onOpen,
}: {
  left: ReactNode;
  right?: ReactNode;
  onOpen?: () => void;
}) {
  return (
    <div
      {...(onOpen && detailRowProps(onOpen))}
      className={cn("flex items-center gap-3 py-1.5 px-1", onOpen && clickableRow)}
    >
      <span className="flex-1 truncate">{left}</span>
      {right !== undefined && (
        <span className="text-muted-foreground shrink-0 tabular-nums">{right}</span>
      )}
    </div>
  );
}

const Empty = ({ text = "Nothing here" }: { text?: string }) => (
  <p className="py-1.5 text-muted-foreground">{text}</p>
);

function Names({
  label,
  names,
  onOpen,
}: {
  label: string;
  names: string[];
  onOpen: () => void;
}) {
  return (
    <div
      {...(names.length > 0 && detailRowProps(onOpen))}
      className={cn("py-1.5 px-1", names.length > 0 && clickableRow)}
    >
      <p className="text-muted-foreground mb-0.5">
        {label} · <span className="tabular-nums">{names.length}</span>
      </p>
      <p className="truncate" title={names.join(", ")}>
        {names.length ? names.join(", ") : "-"}
      </p>
    </div>
  );
}

function Ranking({ items }: { items: { name: string; n: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  if (!items.length) return <Empty />;
  return (
    <>
      {items.map((i) => (
        <div key={i.name} className="py-1.5 space-y-1">
          <Row left={i.name} right={i.n} />
          <div className="h-1 rounded-full bg-secondary">
            <div
              className="h-1 rounded-full bg-primary"
              style={{ width: `${(i.n / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </>
  );
}

export function MonitorPanels({ m }: { m: Monitor }) {
  const jobTitles = useJobTitles();
  const [detail, setDetail] = useState<{ title: string; fields: DetailField[] } | null>(null);
  const open = (title: string, fields: DetailField[]) => () => setDetail({ title, fields });
  const o = m.orphans;
  const orphanCount =
    o.accounts_without_employee.length +
    o.employees_without_account.length +
    o.projects_without_members.length;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-medium mb-2">Security</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Panel title="Failed sign-ins · 7 days" count={m.failed_logins.length}>
            {m.failed_logins.length ? (
              m.failed_logins.map((f, i) => (
                <Row
                  key={i}
                  left={f.email ?? "-"}
                  right={when(f.created_at)}
                  onOpen={open("Failed sign-in", [
                    { label: "Email", value: f.email },
                    { label: "Time", value: when(f.created_at) },
                    { label: "Message", value: f.message, block: true },
                  ])}
                />
              ))
            ) : (
              <Empty />
            )}
          </Panel>
          <Panel title="Inactive over 30 days" count={m.inactive_accounts.length}>
            {m.inactive_accounts.length ? (
              m.inactive_accounts.map((a) => (
                <Row
                  key={a.id}
                  left={
                    jobTitles.byUser(a.id)
                      ? `${a.full_name ?? a.email} · ${jobTitles.byUser(a.id)}`
                      : (a.full_name ?? a.email)
                  }
                  right={
                    a.last_sign_in_at
                      ? `${daysAgo(a.last_sign_in_at)} days ago`
                      : "never signed in"
                  }
                  onOpen={open("Inactive account", [
                    { label: "Name", value: a.full_name },
                    { label: "Email", value: a.email },
                    { label: "Job title", value: jobTitles.byUser(a.id) },
                    {
                      label: "Last sign-in",
                      value: a.last_sign_in_at ? when(a.last_sign_in_at) : "never signed in",
                    },
                  ])}
                />
              ))
            ) : (
              <Empty />
            )}
          </Panel>
          <Panel title="Role & access changes">
            {m.access_changes.length ? (
              m.access_changes.map((a, i) => (
                <Row
                  key={i}
                  left={`${a.actor ?? "system"}: ${a.action} ${a.entity_type} ${a.entity_id}`}
                  right={when(a.created_at)}
                  onOpen={open("Access change", [
                    { label: "Actor", value: a.actor ?? "system" },
                    { label: "Action", value: a.action },
                    { label: "Entity", value: a.entity_type },
                    { label: "Entity ID", value: a.entity_id },
                    { label: "Time", value: when(a.created_at) },
                  ])}
                />
              ))
            ) : (
              <Empty />
            )}
          </Panel>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2">Data health</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Panel title="Errors · 24 hours" count={m.errors.last_24h}>
            {m.errors.recent.length ? (
              m.errors.recent.map((e, i) => (
                <Row
                  key={i}
                  left={
                    <span title={e.message}>
                      <span className="text-rose-600 dark:text-rose-500">{e.source}</span> {e.message}
                    </span>
                  }
                  right={when(e.created_at)}
                  onOpen={open("Error", [
                    { label: "Source", value: e.source },
                    { label: "User", value: e.user_name },
                    { label: "Time", value: when(e.created_at) },
                    {
                      label: "Message",
                      value: <pre className="whitespace-pre-wrap break-words text-xs">{e.message}</pre>,
                      block: true,
                    },
                  ])}
                />
              ))
            ) : (
              <Empty text="No errors reported" />
            )}
          </Panel>
          <Panel title="Unlinked records" count={orphanCount}>
            <Names
              label="Accounts without employee"
              names={o.accounts_without_employee}
              onOpen={open("Accounts without employee", [
                { label: "Total", value: o.accounts_without_employee.length },
                { label: "Names", value: o.accounts_without_employee.join(", "), block: true },
              ])}
            />
            <Names
              label="Active employees without account"
              names={o.employees_without_account}
              onOpen={open("Active employees without account", [
                { label: "Total", value: o.employees_without_account.length },
                { label: "Names", value: o.employees_without_account.join(", "), block: true },
              ])}
            />
            <Names
              label="Projects without members"
              names={o.projects_without_members}
              onOpen={open("Projects without members", [
                { label: "Total", value: o.projects_without_members.length },
                { label: "Names", value: o.projects_without_members.join(", "), block: true },
              ])}
            />
          </Panel>
          <Panel title="Storage">
            {m.storage.length ? (
              m.storage.map((s) => (
                <Row
                  key={s.bucket}
                  left={s.bucket}
                  right={`${s.files} files · ${bytes(s.bytes)}`}
                  onOpen={open("Storage bucket", [
                    { label: "Bucket", value: s.bucket },
                    { label: "Files", value: s.files },
                    { label: "Size", value: bytes(s.bytes) },
                  ])}
                />
              ))
            ) : (
              <Empty text="No files uploaded" />
            )}
          </Panel>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2">HR operations</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Panel
            title={`Not checked in · ${m.attendance_today.date}`}
            count={m.attendance_today.missing.length}
          >
            <p className="py-1.5 text-muted-foreground">
              {m.attendance_today.recorded} recorded today
            </p>
            {m.attendance_today.missing.map((n) => (
              <Row key={n} left={n} />
            ))}
          </Panel>
          <Panel title="Pending over 3 days" count={m.stale_approvals.length}>
            {m.stale_approvals.length ? (
              m.stale_approvals.map((a, i) => (
                <Row
                  key={i}
                  left={`${a.full_name ?? "-"} · ${a.kind} ${a.type}`}
                  right={`${daysAgo(a.created_at)} days`}
                  onOpen={open("Pending approval", [
                    { label: "Name", value: a.full_name },
                    { label: "Kind", value: a.kind },
                    { label: "Type", value: a.type },
                    { label: "Submitted", value: when(a.created_at) },
                    { label: "Waiting", value: `${daysAgo(a.created_at)} days` },
                  ])}
                />
              ))
            ) : (
              <Empty />
            )}
          </Panel>
          <Panel title="Payroll">
            <p className="py-1.5 text-muted-foreground">
              Locked until {m.payroll.locked_until ?? "-"}
            </p>
            {m.payroll.runs.length ? (
              m.payroll.runs.map((r) => (
                <Row
                  key={r.period}
                  left={r.period.slice(0, 7)}
                  right={
                    <span className={r.status === "Finalized" ? "text-emerald-600 dark:text-emerald-500" : "text-amber-700 dark:text-amber-500"}>
                      {r.status}
                    </span>
                  }
                  onOpen={open("Payroll run", [
                    { label: "Period", value: r.period.slice(0, 7) },
                    { label: "Status", value: r.status },
                    { label: "Finalized", value: r.finalized_at && when(r.finalized_at) },
                  ])}
                />
              ))
            ) : (
              <Empty text="No payroll runs yet" />
            )}
          </Panel>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2">Activity</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Panel title="Most active users · 30 days">
            <Ranking items={m.top_actors} />
          </Panel>
          <Panel title="Most changed data · 30 days">
            <Ranking items={m.top_entities} />
          </Panel>
          <Panel title="Active in last 15 minutes">
            {m.active_now.length ? (
              m.active_now.map((a, i) => (
                <Row
                  key={i}
                  left={
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {a.name ?? "-"}
                    </span>
                  }
                  right={new Date(a.last_at).toLocaleTimeString()}
                  onOpen={open("Active user", [
                    { label: "Name", value: a.name },
                    { label: "Last activity", value: when(a.last_at) },
                  ])}
                />
              ))
            ) : (
              <Empty text="Nobody right now" />
            )}
          </Panel>
        </div>
      </section>

      <DetailDialog
        title={detail?.title ?? ""}
        fields={detail?.fields ?? null}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
