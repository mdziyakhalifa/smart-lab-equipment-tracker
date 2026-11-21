import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  Calendar,
  Loader2,
  Monitor,
  Palette,
  Save,
  ShieldCheck,
  Sun,
  Moon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { SystemInfo } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, TableSkeleton } from "@/components/common/states";

const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
];

function getTheme() {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem("slt_theme") as "system" | "light" | "dark") ?? "system";
}

function setTheme(theme: string) {
  localStorage.setItem("slt_theme", theme);
  const root = document.documentElement;
  if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [theme, setThemeState] = useState<"system" | "light" | "dark">(getTheme);
  const [language, setLanguageState] = useState("en");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const systemQuery = useQuery({
    queryKey: ["system", "info"],
    queryFn: () => api.get<SystemInfo>("/system/info"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Persist preferences to localStorage
      setTheme(theme);
      localStorage.setItem("slt_language", language);
      localStorage.setItem("slt_email_notifications", String(emailNotifications));
      localStorage.setItem("slt_push_notifications", String(pushNotifications));
      localStorage.setItem("slt_compact_mode", String(compactMode));
      localStorage.setItem("slt_auto_refresh", String(autoRefresh));
      return { ok: true } as const;
    },
    onSuccess: () => {
      toast.success("Settings saved.");
      setDialogOpen(false);
    },
    onError: () => toast.error("Unable to save settings."),
  });

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Configure application preferences, appearance and notification behavior."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Theme" value={theme.charAt(0).toUpperCase() + theme.slice(1)} description="UI appearance" icon={Palette} tone="navy" />
        <StatCard title="Language" value={language.toUpperCase()} description="Interface language" icon={Monitor} tone="blue" />
        <StatCard title="Auto refresh" value={autoRefresh ? "On" : "Off"} description="Live data polling" icon={ShieldCheck} tone={autoRefresh ? "green" : "slate"} />
        <StatCard title="System" value={systemQuery.data?.name ?? "Smart Lab Tracker"} description={systemQuery.data?.version ?? "1.0.0"} icon={Monitor} tone="slate" />
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize the look and feel of the interface.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="settings-theme">Theme</Label>
            <Select id="settings-theme" value={theme} onChange={(event) => setThemeState(event.target.value as "system" | "light" | "dark")}>
              {THEMES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <p className="field-hint">Choose how the interface adapts to your device color scheme.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-language">Language</Label>
            <Select id="settings-language" value={language} onChange={(event) => setLanguageState(event.target.value)}>
              {LANGUAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <p className="field-hint">Some content may remain in English until translations are completed.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch checked={compactMode} onCheckedChange={setCompactMode} />
              <div>
                <p className="text-[12.5px] font-medium text-foreground">Compact mode</p>
                <p className="text-[11px] text-foreground-muted">Tighter spacing for data-dense screens.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Choose how you receive updates from laboratory workflows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              <div>
                <p className="text-[12.5px] font-medium text-foreground">Email notifications</p>
                <p className="text-[11px] text-foreground-muted">Receive email digests for approvals and overdue items.</p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch checked={pushNotifications} onCheckedChange={setPushNotifications} />
              <div>
                <p className="text-[12.5px] font-medium text-foreground">In-app push notifications</p>
                <p className="text-[11px] text-foreground-muted">Show real-time alerts in the notification bell.</p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
              <div>
                <p className="text-[12.5px] font-medium text-foreground">Auto-refresh live data</p>
                <p className="text-[11px] text-foreground-muted">Periodically refresh dashboards and tables.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <CardHeader>
          <CardTitle>System information</CardTitle>
          <CardDescription>Read-only information about the running server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {systemQuery.isLoading ? (
            <TableSkeleton rows={3} columns={2} />
          ) : systemQuery.isError ? (
            <div className="p-4 text-sm text-foreground-danger">Unable to load system information.</div>
          ) : systemQuery.data ? (
            <dl className="grid gap-x-4 gap-y-3 text-[12px] sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Application</dt>
                <dd className="mt-0.5 text-foreground">{systemQuery.data.name}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Version</dt>
                <dd className="mt-0.5 text-foreground">{systemQuery.data.version}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Database</dt>
                <dd className="mt-0.5 text-foreground">{systemQuery.data.database}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Scheduler</dt>
                <dd className={`mt-0.5 ${systemQuery.data.scheduler_enabled ? "text-success" : "text-foreground-muted"} font-medium`}>{systemQuery.data.scheduler_enabled ? "Enabled" : "Disabled"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Demo mode</dt>
                <dd className={`mt-0.5 ${systemQuery.data.demo_mode ? "text-warning" : "text-foreground-muted"} font-medium`}>{systemQuery.data.demo_mode ? "Enabled" : "Disabled"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Server time</dt>
                <dd className="mt-0.5 font-mono text-foreground">{systemQuery.data.server_time}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Counts</dt>
                <dd className="mt-0.5 text-foreground">{systemQuery.data.counts.users} users · {systemQuery.data.counts.equipment} equipment</dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => setDialogOpen(true)}>Save settings</Button>
        <Button variant="secondary" onClick={() => setResetOpen(true)}>Reset to defaults</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save settings?</DialogTitle>
            <DialogDescription>Your appearance, language and notification preferences will be stored in your browser.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset settings to defaults?"
        description="This clears your stored appearance, language and notification preferences."
        confirmLabel="Reset settings"
        destructive
        loading={false}
        onConfirm={() => {
          localStorage.removeItem("slt_theme");
          localStorage.removeItem("slt_language");
          localStorage.removeItem("slt_email_notifications");
          localStorage.removeItem("slt_push_notifications");
          localStorage.removeItem("slt_compact_mode");
          localStorage.removeItem("slt_auto_refresh");
          setThemeState("system");
          setLanguageState("en");
          setEmailNotifications(true);
          setPushNotifications(true);
          setCompactMode(false);
          setAutoRefresh(true);
          setTheme("system");
          toast.success("Settings reset to defaults.");
          setResetOpen(false);
        }}
      />
    </div>
  );
}

