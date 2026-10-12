import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { useRouteError } from "react-router-dom";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import i18n from "@/lib/i18n";
import { logClientError } from "@/lib/errorLog";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
    logClientError("render", error.message, {
      path: window.location.pathname,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return <ErrorFallback />;
  }
}

function ErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full rounded-xl border border-border bg-card p-6 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">
          {i18n.t("common.errorTitle", { defaultValue: "Something broke" })}
        </p>
        <p className="text-xs text-muted-foreground">
          {i18n.t("common.errorBody", {
            defaultValue:
              "This page could not be displayed. Reloading usually fixes it.",
          })}
        </p>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => window.location.reload()}
        >
          <RotateCw className="w-3.5 h-3.5 mr-1.5" />
          {i18n.t("common.reload", { defaultValue: "Reload" })}
        </Button>
      </div>
    </div>
  );
}

export function RouteError() {
  const error = useRouteError() as Error | undefined;
  useEffect(() => {
    console.error("Route error:", error);
    logClientError("render", error?.message ?? String(error), {
      path: window.location.pathname,
    });
  }, [error]);
  return <ErrorFallback />;
}
