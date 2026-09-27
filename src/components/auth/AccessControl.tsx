import { ReactNode } from "react";
import { useAuth } from "@/context/auth";

type Action = "create" | "read" | "update" | "delete";

interface AccessControlProps {
  feature: string;
  action: Action;
  children: ReactNode;
  /** Rendered when access is denied. Defaults to null (nothing rendered) */
  fallback?: ReactNode;
}

/**
 * Conditionally render children based on the current user's permissions.
 *
 * @example
 * <AccessControl feature="daily-report" action="create">
 *   <Button>Log Task</Button>
 * </AccessControl>
 */
export function AccessControl({
  feature,
  action,
  children,
  fallback = null,
}: AccessControlProps) {
  const { canCreate, canRead, canUpdate, canDelete } = useAuth();

  const allowed =
    action === "create"
      ? canCreate(feature)
      : action === "read"
        ? canRead(feature)
        : action === "update"
          ? canUpdate(feature)
          : canDelete(feature);

  return allowed ? <>{children}</> : <>{fallback}</>;
}
