import { Link } from "react-router-dom";
import { ArrowLeft, FlaskConical, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning-faint border border-warning/40">
          <ShieldAlert className="h-6 w-6 text-foreground-warning" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground-muted">Access restricted</p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">You don’t have permission for this page</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Your account role does not include access to this section. Return to your dashboard or contact an administrator.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="secondary">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /> Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
          <FlaskConical className="h-6 w-6 text-primary" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground-muted">Error 404</p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-foreground-muted">The page you requested does not exist or has been moved.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
