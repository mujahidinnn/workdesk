import { useState, FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth";
import { supabase } from "@/integrations/supabase/client";

// Recreated by ensure_default_admin() on every wipe and reset, so these
// always sign in.
const DEFAULT_ADMIN = { email: "admin@workdesk.com", password: "Admin123!" };

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { user, signIn, signInWithGoogle, isLoading } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");

  if (!isLoading && user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      const msgLow = msg.toLowerCase();
      if (
        msgLow.includes("invalid") ||
        msgLow.includes("credentials") ||
        msgLow.includes("wrong")
      ) {
        setError(t("login.errors.invalidCredentials"));
      } else if (
        msgLow.includes("schema") ||
        msgLow.includes("database error")
      ) {
        setError(t("login.errors.authServiceError"));
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Recovery link targets the app root (always an allowed redirect); the auth listener
  // forwards to /reset-password, so no extra URL needs allow-listing in Supabase.
  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSentTo(null);
    setResetBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/` },
      );
      if (resetError) throw resetError;
      setSentTo(email);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      const isNotEnabled =
        msg.toLowerCase().includes("provider is not enabled") ||
        msg.toLowerCase().includes("unsupported provider");
      setError(isNotEnabled ? t("login.errors.googleNotConfigured") : msg);
      setGoogleBusy(false);
    }
  };

  const switchMode = (next: typeof mode) => {
    setError(null);
    setSentTo(null);
    setMode(next);
  };

  const errorBox = error && (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-xs text-rose-700 bg-rose-100 border border-rose-300 px-3 py-2 rounded-lg"
    >
      {error}
    </motion.p>
  );

  if (mode === "forgot") {
    return (
      <AuthLayout>
        <button
          type="button"
          onClick={() => switchMode("signin")}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t("login.backToSignIn")}
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">
            {t("login.forgotTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("login.forgotSubtitle")}
          </p>
        </div>

        <form onSubmit={handleForgotPassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-email" className="text-xs font-medium">
              {t("login.email")}
            </Label>
            <Input
              id="reset-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="h-10"
            />
          </div>

          {sentTo && (
            <p className="text-xs text-emerald-700 bg-emerald-100 border border-emerald-300 px-3 py-2 rounded-lg">
              {t("login.resetSent", { email: sentTo })}
            </p>
          )}

          {errorBox}

          <Button
            type="submit"
            disabled={!email}
            loading={resetBusy}
            className="w-full h-10 font-semibold"
          >
            {resetBusy ? t("login.sendingReset") : t("login.sendResetLink")}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">
          {t("login.welcome")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("login.tagline")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-medium">
            {t("login.email")}
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-medium">
            {t("login.password")}
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-10 pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              aria-label={t("login.password")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPass ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => switchMode("forgot")}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {t("login.forgotPassword")}
          </button>
        </div>

        {errorBox}

        <Button
          type="submit"
          disabled={googleBusy || !email || !password}
          loading={submitting}
          className="w-full h-10 font-semibold"
        >
          {submitting ? t("login.signingIn") : t("login.signIn")}
        </Button>

        <Button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          loading={googleBusy}
          variant="outline"
          className="w-full h-10 gap-2.5 font-medium"
        >
          <GoogleIcon className="w-4 h-4" />
          {googleBusy ? t("login.redirecting") : t("login.continueWithGoogle")}
        </Button>
      </form>

      {/* Pinned to the bottom of the form panel (AuthLayout's section is relative). */}
      <p className="absolute bottom-4 inset-x-0 text-center text-[11px] text-muted-foreground">
        {DEFAULT_ADMIN.email} · {DEFAULT_ADMIN.password}
      </p>
    </AuthLayout>
  );
}
