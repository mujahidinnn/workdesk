import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ClipboardList,
  CalendarRange,
  AlertOctagon,
  Download,
  Database,
  X,
  Shield,
  Info,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  useFeatures,
  useUserOverrides,
  useUpsertUserOverride,
  useRolePermissions,
} from "@/hooks/usePermissions";
import { resolvePermissions } from "@/lib/permissions";
import type {
  Profile,
  Feature,
  FeaturePermission,
  UserOverride,
  RolePermission,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useJobTitles } from "@/hooks/useJobTitles";

const featureIcons: Record<string, React.ElementType> = {
  LayoutDashboard,
  ClipboardList,
  CalendarRange,
  AlertOctagon,
  Download,
  Database,
};

const CRUD_LABELS = [
  { key: "can_create" as const, label: "Create", short: "C" },
  { key: "can_read" as const, label: "Read", short: "R" },
  { key: "can_update" as const, label: "Update", short: "U" },
  { key: "can_delete" as const, label: "Delete", short: "D" },
];

interface FeatureCardProps {
  feature: Feature;
  rolePerm: FeaturePermission;
  override: UserOverride | undefined;
  onToggle: (featureId: number, active: boolean) => void;
  onCrudChange: (
    featureId: number,
    key: keyof FeaturePermission,
    value: boolean,
  ) => void;
}

function FeatureCard({
  feature,
  rolePerm,
  override,
  onToggle,
  onCrudChange,
}: FeatureCardProps) {
  const Icon = featureIcons[feature.icon_name ?? "Database"] ?? Database;
  const isOverrideActive = override?.is_override_active ?? false;

  const effective: FeaturePermission =
    isOverrideActive && override
      ? {
          can_create: override.can_create ?? rolePerm.can_create,
          can_read: override.can_read ?? rolePerm.can_read,
          can_update: override.can_update ?? rolePerm.can_update,
          can_delete: override.can_delete ?? rolePerm.can_delete,
        }
      : rolePerm;

  return (
    <motion.div
      layout
      animate={{
        borderColor: isOverrideActive
          ? "hsl(var(--primary)/0.3)"
          : "hsl(var(--border))",
        boxShadow: isOverrideActive
          ? "0 0 16px hsl(var(--primary)/0.15), 0 0 0 1px hsl(var(--primary)/0.2)"
          : "none",
      }}
      transition={{ duration: 0.25 }}
      className={cn(
        "glass-card rounded-xl p-4 flex flex-col gap-3 border transition-all",
        isOverrideActive ? "bg-primary/5" : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all",
              isOverrideActive ? "bg-primary/20" : "bg-secondary",
            )}
          >
            <Icon
              className={cn(
                "w-4 h-4",
                isOverrideActive ? "text-primary" : "text-muted-foreground",
              )}
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">
              {feature.feature_name}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">
              {feature.feature_key}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isOverrideActive && (
            <span className="text-[9px] text-muted-foreground">
              Role default
            </span>
          )}
          <Switch
            checked={isOverrideActive}
            onCheckedChange={(checked) => onToggle(feature.id, checked)}
          />
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-4 gap-1 transition-all",
          !isOverrideActive && "opacity-40 pointer-events-none",
        )}
      >
        {CRUD_LABELS.map(({ key, label, short }) => (
          <label
            key={key}
            className={cn(
              "flex flex-col items-center gap-1 p-1.5 rounded-lg cursor-pointer transition-colors",
              isOverrideActive
                ? effective[key]
                  ? "bg-primary/15 border border-primary/30"
                  : "bg-secondary/60 border border-border/40 hover:bg-secondary"
                : "bg-secondary/30 border border-border/20",
            )}
          >
            <Checkbox
              checked={effective[key]}
              onCheckedChange={(v) => onCrudChange(feature.id, key, !!v)}
              className="w-3 h-3 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              disabled={!isOverrideActive}
            />
            <span
              className={cn(
                "text-[9px] font-bold",
                effective[key] && isOverrideActive
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              {short}
            </span>
            <span className="text-[8px] text-muted-foreground/60 hidden sm:block">
              {label}
            </span>
          </label>
        ))}
      </div>

      {isOverrideActive && (
        <p className="text-[9px] text-muted-foreground flex items-center gap-1">
          <Info className="w-2.5 h-2.5" />
          Role defaults: C={rolePerm.can_create ? "✓" : "✗"} R=
          {rolePerm.can_read ? "✓" : "✗"} U={rolePerm.can_update ? "✓" : "✗"} D=
          {rolePerm.can_delete ? "✓" : "✗"}
        </p>
      )}
    </motion.div>
  );
}

interface PermissionsDialogProps {
  user: Profile;
  open: boolean;
  onClose: () => void;
}

// Module-level so the reference is stable: inline `= []` defaults make
// `useEffect([overrides])` loop forever while the query is loading.
const EMPTY_FEATURES: Feature[] = [];
const EMPTY_OVERRIDES: UserOverride[] = [];
const EMPTY_ROLE_PERMS: RolePermission[] = [];
const EMPTY_RESOLVE: UserOverride[] = [];

export function PermissionsDialog({
  user,
  open,
  onClose,
}: PermissionsDialogProps) {
  const { data: features = EMPTY_FEATURES } = useFeatures();
  const jobTitle = useJobTitles().byUser(user.id);
  const { data: overrides = EMPTY_OVERRIDES } = useUserOverrides(user.id);
  const { data: rolePerms = EMPTY_ROLE_PERMS } = useRolePermissions(
    user.role_id,
  );
  const upsertOverride = useUpsertUserOverride();

  const [draft, setDraft] = useState<UserOverride[]>(EMPTY_OVERRIDES);
  useEffect(() => {
    setDraft(overrides);
  }, [overrides]);

  const roleMap = resolvePermissions(features, rolePerms, EMPTY_RESOLVE);

  function getOverride(featureId: number): UserOverride | undefined {
    return draft.find((o) => o.feature_id === featureId);
  }

  async function handleToggle(featureId: number, active: boolean) {
    const existing = getOverride(featureId);
    const rp = rolePerms.find((r) => r.feature_id === featureId);

    const payload = {
      user_id: user.id,
      feature_id: featureId,
      is_override_active: active,
      can_create: existing?.can_create ?? rp?.can_create ?? false,
      can_read: existing?.can_read ?? rp?.can_read ?? false,
      can_update: existing?.can_update ?? rp?.can_update ?? false,
      can_delete: existing?.can_delete ?? rp?.can_delete ?? false,
    };

    setDraft((prev) => {
      const idx = prev.findIndex((o) => o.feature_id === featureId);
      const updated = {
        ...payload,
        id: existing?.id ?? 0,
        feature: existing?.feature,
      };
      return idx >= 0
        ? prev.map((o, i) => (i === idx ? updated : o))
        : [...prev, updated];
    });

    await upsertOverride.mutateAsync(payload);
  }

  async function handleCrudChange(
    featureId: number,
    key: keyof FeaturePermission,
    value: boolean,
  ) {
    const existing = getOverride(featureId);
    const rp = rolePerms.find((r) => r.feature_id === featureId);

    const base = {
      can_create: existing?.can_create ?? rp?.can_create ?? false,
      can_read: existing?.can_read ?? rp?.can_read ?? false,
      can_update: existing?.can_update ?? rp?.can_update ?? false,
      can_delete: existing?.can_delete ?? rp?.can_delete ?? false,
    };
    const updated = { ...base, [key]: value };

    const payload = {
      user_id: user.id,
      feature_id: featureId,
      is_override_active: existing?.is_override_active ?? true,
      ...updated,
    };

    setDraft((prev) => {
      const idx = prev.findIndex((o) => o.feature_id === featureId);
      const row = {
        ...payload,
        id: existing?.id ?? 0,
        feature: existing?.feature,
      };
      return idx >= 0
        ? prev.map((o, i) => (i === idx ? row : o))
        : [...prev, row];
    });

    await upsertOverride.mutateAsync(payload);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-zinc-950/40 dark:bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="fixed right-0 top-0 h-full w-full max-w-lg z-50 flex flex-col bg-card border-l border-border overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Shield className="w-4.5 h-4.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {user.full_name}
                    {jobTitle && (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                        · {jobTitle}
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {user.role?.role_name ?? "No role"} · Feature Permissions
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-border/60 bg-secondary/20 flex-shrink-0">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">
                  Toggle override
                </span>{" "}
                to customise permissions for this user. When off, the user's
                role defaults apply. CRUD checkboxes are editable when override
                is active.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
              <div className="grid grid-cols-1 gap-3">
                {features.map((feature) => {
                  const rolePerm = roleMap[feature.feature_key] ?? {
                    can_create: false,
                    can_read: false,
                    can_update: false,
                    can_delete: false,
                  };
                  const override = getOverride(feature.id);
                  return (
                    <FeatureCard
                      key={feature.id}
                      feature={feature}
                      rolePerm={rolePerm}
                      override={override}
                      onToggle={handleToggle}
                      onCrudChange={handleCrudChange}
                    />
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border flex-shrink-0">
              <p className="text-[11px] text-muted-foreground text-center">
                Changes save automatically · Active user session will update on
                next page load
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
