import { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { LogoMark } from "@/components/brand/Logo";
import { useAuth } from "@/context/auth";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div role="status" aria-label="Loading WorkDesk" className="flex flex-col items-center gap-3">
        <LogoMark animated className="h-10 w-auto text-primary" />
        <p className="logo-draw-text text-sm font-semibold text-foreground">
          WorkDesk
        </p>
      </div>
    </div>
  );
}

interface ProtectedRouteProps {
  /** If provided, also checks if user can read this feature key */
  featureKey?: string;
  /** When given, rendered instead of <Outlet /> once access checks pass */
  children?: ReactNode;
}

export function ProtectedRoute({ featureKey, children }: ProtectedRouteProps) {
  const { user, isLoading, canRead } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  if (featureKey && !canRead(featureKey)) {
    return <Navigate to="/403" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
