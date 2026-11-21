import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  CalendarCheck2,
  FlaskConical,
  GraduationCap,
  Loader2,
  LockKeyhole,
  Microscope,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth, roleLabels } from "@/hooks/use-auth";
import type { Role } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const schema = z.object({
  identifier: z.string().min(1, "Enter your email address or username."),
  password: z.string().min(1, "Enter your password."),
});

type LoginValues = z.infer<typeof schema>;

const demoAccounts: { role: Role; name: string; email: string; icon: typeof Users }[] = [
  { role: "admin", name: "Dr. Sarah Mitchell", email: "admin@labtrack.edu", icon: ShieldCheck },
  { role: "lab_assistant", name: "Omar Hassan", email: "assistant@labtrack.edu", icon: Wrench },
  { role: "student", name: "Ayesha Khan", email: "student@labtrack.edu", icon: GraduationCap },
  { role: "faculty", name: "Dr. James Carter", email: "faculty@labtrack.edu", icon: Microscope },
];

export function LoginPage() {
  const { login, demoLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";
  const [demoLoading, setDemoLoading] = useState<Role | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setAuthError(null);
    try {
      await login(values.identifier, values.password);
      toast.success("Signed in successfully.");
      navigate(from, { replace: true });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }

  async function onDemo(role: Role) {
    setAuthError(null);
    setDemoLoading(role);
    try {
      const user = await demoLogin(role);
      toast.success(`Signed in as ${roleLabels[user.role]}.`);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Demo sign-in failed.");
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Heritage Navy Enterprise Brand Sidebar */}
      <aside className="relative hidden w-[48%] flex-col justify-between overflow-hidden bg-sidebar px-12 py-10 text-sidebar-foreground lg:flex xl:px-16 border-r border-sidebar-border">
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#29435D] border border-sidebar-border/80">
              <FlaskConical className="h-5 w-5 text-[#EAE1D3]" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-sidebar-foreground">Smart Lab</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-sidebar-muted">Equipment Tracker</p>
            </div>
          </div>

          <div className="mt-16 max-w-xl">
            <span className="inline-block rounded-full border border-sidebar-border bg-sidebar-accent/50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary">
              Heritage Modern Enterprise
            </span>
            <h1 className="mt-4 text-[34px] font-semibold leading-[1.18] tracking-tight text-sidebar-foreground xl:text-[40px]">
              Institutional Laboratory & Asset Intelligence Platform.
            </h1>
            <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-sidebar-muted">
              Built for universities, engineering colleges, and research facilities. Full lifecycle tracking across equipment inventory, borrowing records, reservation calendars, calibration, and safety compliance.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                { icon: BadgeCheck, title: "Asset Registry", text: "Physical unit IDs with QR code labels" },
                { icon: CalendarCheck2, title: "Conflict-Free Booking", text: "Slot-based reservation validation" },
                { icon: BellRing, title: "Compliance Alerts", text: "Proactive calibration and maintenance notices" },
                { icon: Wrench, title: "Operational Logs", text: "Complete maintenance and repair history" },
              ].map((item) => (
                <div key={item.title} className="rounded-md border border-sidebar-border/70 bg-[#1D3550]/50 p-3.5">
                  <item.icon className="h-4 w-4 text-secondary" />
                  <p className="mt-2 text-[12.5px] font-semibold text-sidebar-foreground">{item.title}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-sidebar-muted">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative mt-8 flex items-center gap-6 border-t border-sidebar-border pt-4 text-[11px] text-sidebar-muted">
          <span className="flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5 text-secondary" /> Role-based access</span>
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-secondary" /> JWT secured</span>
          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-secondary" /> 4 User tiers</span>
        </div>
      </aside>

      {/* Main Sign-In Form (Warm Cream Background) */}
      <main className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-[52%] lg:px-14 xl:px-20 bg-background">
        <div className="mx-auto w-full max-w-[430px]">
          {/* Mobile Brand Header */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sidebar">
              <FlaskConical className="h-5 w-5 text-[#EAE1D3]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Smart Lab</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Equipment Tracker</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-7 shadow-card">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Sign in to workspace</h2>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Enter your institutional account credentials, or use one-click demo login below.
              </p>
            </div>

            {authError ? (
              <Alert variant="danger" className="mt-4" title="Authentication failed">
                {authError}
              </Alert>
            ) : null}

            <form className="mt-5 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="space-y-1">
                <Label htmlFor="identifier">Email or Username</Label>
                <Input
                  id="identifier"
                  autoComplete="username"
                  placeholder="e.g. admin@labtrack.edu"
                  aria-invalid={Boolean(errors.identifier)}
                  {...register("identifier")}
                />
                {errors.identifier ? <p className="text-[11px] text-danger">{errors.identifier.message}</p> : null}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <span className="text-[10px] font-mono text-muted-foreground">Demo: Demo@1234</span>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  aria-invalid={Boolean(errors.password)}
                  {...register("password")}
                />
                {errors.password ? <p className="text-[11px] text-danger">{errors.password.message}</p> : null}
              </div>

              <Button type="submit" className="w-full h-9 text-xs font-semibold" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LockKeyhole className="mr-1.5 h-3.5 w-3.5" />}
                Sign in to Smart Lab
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Instant Demo Login</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.role}
                  type="button"
                  onClick={() => void onDemo(account.role)}
                  disabled={demoLoading !== null}
                  className="group flex items-start gap-2.5 rounded-md border border-border bg-warm-100 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-warm-200/60 disabled:opacity-50 cursor-pointer"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20">
                    {demoLoading === account.role ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <account.icon className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-foreground">{roleLabels[account.role]}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{account.name}</p>
                  </div>
                  <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            Academic Demonstration System • Heritage Modern Enterprise UI • Built with FastAPI & React
          </p>
        </div>
      </main>
    </div>
  );
}
