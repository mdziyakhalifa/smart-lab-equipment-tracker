import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  ChevronRight,
  LogOut,
  Menu,
  Search,
  Settings,
  UserCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";
import { useAuth, roleLabels } from "@/hooks/use-auth";
import type { AppNotification, Page } from "@/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

const labels: Record<string, string> = {
  dashboard: "Dashboard",
  equipment: "Equipment Inventory",
  availability: "Availability",
  borrow: "Borrow Equipment",
  returns: "Returns",
  borrowings: "Borrowing Records",
  reservations: "Reservation Calendar",
  "my-reservations": "My Reservations",
  scan: "QR Scanner",
  "damage-reports": "Damage Reports",
  maintenance: "Maintenance",
  calibration: "Calibration",
  consumables: "Consumables",
  notifications: "Notifications",
  reports: "Reports & Analytics",
  users: "User Management",
  labs: "Laboratory Management",
  profile: "Profile",
  settings: "Settings",
  new: "New",
  edit: "Edit",
};

function Breadcrumbs() {
  const location = useLocation().pathname;
  const segments = location.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  return (
    <nav className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex" aria-label="Breadcrumb">
      <span className="font-medium text-muted-foreground/70">Smart Lab</span>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const label = /^\d+$/.test(segment) ? "Asset Detail" : labels[segment] ?? segment.replace(/-/g, " ");
        return (
          <span key={`${segment}-${index}`} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            <span className={cn(isLast ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
          </span>
        );
      })}
    </nav>
  );
}

function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const countQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 30000,
  });
  const latestQuery = useQuery({
    queryKey: ["notifications", "latest"],
    queryFn: () => api.get<Page<AppNotification>>("/notifications", { page_size: 6 }),
    refetchInterval: 60000,
  });
  const markAll = useMutation({
    mutationFn: () => api.put("/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markOne = useMutation({
    mutationFn: (id: number) => api.put(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const count = countQuery.data?.count ?? 0;
  const items = latestQuery.data?.items ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-foreground/80 hover:bg-warm-200/60 hover:text-foreground" aria-label="Notifications">
          <Bell className="h-[18px] w-[18px]" />
          {count > 0 ? (
            <span className="absolute 0 top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-card shadow-xs">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0 bg-card border-border shadow-elevated">
        <div className="flex items-center justify-between border-b border-border bg-warm-200/40 px-3.5 py-2.5">
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Notifications</p>
            <p className="text-[11px] text-muted-foreground">{count} unread alert{count === 1 ? "" : "s"}</p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-[11px] text-primary hover:text-primary-hover hover:bg-warm-200" onClick={() => markAll.mutate()} disabled={count === 0 || markAll.isPending}>
            <CheckCheck className="mr-1 h-3.5 w-3.5" /> Mark all read
          </Button>
        </div>
        <div className="max-h-[380px] overflow-y-auto divide-y divide-border">
          {latestQuery.isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">All notifications are up to date.</div>
          ) : (
            items.map((notification) => (
              <button
                key={notification.id}
                className={cn(
                  "flex w-full gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-warm-200/50",
                  !notification.is_read ? "bg-primary/5" : "bg-card",
                )}
                onClick={() => {
                  if (!notification.is_read) markOne.mutate(notification.id);
                  setOpen(false);
                  if (notification.link) navigate(notification.link);
                }}
              >
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", notification.is_read ? "bg-muted-foreground/30" : "bg-primary")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-foreground">{notification.title}</span>
                  <span className="mt-0.5 block line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{notification.message}</span>
                  <span className="mt-1 block text-[10px] text-muted-foreground/80">{relativeTime(notification.created_at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <button
          className="flex w-full items-center justify-center border-t border-border bg-warm-100/60 px-3 py-2.5 text-xs font-medium text-primary hover:bg-warm-200 transition-colors"
          onClick={() => {
            setOpen(false);
            navigate("/notifications");
          }}
        >
          View all notifications
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md p-1 pr-2 transition-colors hover:bg-warm-200/60" aria-label="Profile menu">
          <Avatar name={user.full_name} className="h-8 w-8 bg-primary/10 text-primary border-primary/20" />
          <span className="hidden text-left md:block">
            <span className="block max-w-[150px] truncate text-xs font-semibold text-foreground">{user.full_name}</span>
            <span className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{roleLabels[user.role]}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card border-border shadow-elevated">
        <DropdownMenuLabel>
          <span className="block truncate text-xs font-semibold text-foreground">{user.full_name}</span>
          <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
          <UserCircle className="mr-2 h-4 w-4 text-muted-foreground" /> My Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
          <Settings className="mr-2 h-4 w-4 text-muted-foreground" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-danger focus:bg-danger-background focus:text-danger"
          onClick={async () => {
            await logout();
            navigate("/login", { replace: true });
          }}
        >
          <LogOut className="mr-2 h-4 w-4 text-danger" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-sm sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden text-foreground hover:bg-warm-200/60" onClick={onOpenMenu} aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <form
          className="relative hidden w-64 md:block"
          onSubmit={(event) => {
            event.preventDefault();
            navigate(search.trim() ? `/equipment?search=${encodeURIComponent(search.trim())}` : "/equipment");
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search asset, model or ID…"
            className="h-8.5 w-full rounded-md border border-border bg-warm-100 pl-8 pr-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary"
          />
        </form>
        <NotificationBell />
        <div className="hidden h-5 w-px bg-border sm:block" />
        <ProfileMenu />
      </div>
    </header>
  );
}
