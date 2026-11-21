import { NavLink } from "react-router-dom";
import { FlaskConical, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useAuth, roleLabels } from "@/hooks/use-auth";
import { cn, initials } from "@/lib/utils";
import { visibleNavGroups } from "./nav";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose, collapsed, onToggleCollapsed }: SidebarProps) {
  const { user } = useAuth();
  if (!user) return null;
  const groups = visibleNavGroups(user.role);

  return (
    <>
      {mobileOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-[#172D46]/60 backdrop-blur-xs lg:hidden"
          onClick={onMobileClose}
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-200 border-r border-sidebar-border",
          collapsed ? "w-[72px]" : "w-[260px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center border-b border-sidebar-border px-4", collapsed ? "justify-center" : "justify-between")}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#29435D] text-sidebar-foreground border border-sidebar-border/80">
              <FlaskConical className="h-5 w-5 text-[#EAE1D3]" />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold tracking-wide text-sidebar-foreground">Smart Lab</p>
                <p className="truncate text-[10px] uppercase tracking-[0.12em] text-sidebar-muted">Equipment Tracker</p>
              </div>
            ) : null}
          </div>
          <button className="rounded p-1 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden" onClick={onMobileClose} aria-label="Close sidebar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-4">
          {groups.map((group) => (
            <div key={group.label} className="mb-5 last:mb-2">
              {!collapsed ? (
                <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted/80">{group.label}</p>
              ) : (
                <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    onClick={onMobileClose}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-foreground shadow-xs font-semibold"
                          : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )
                    }
                  >
                    <item.icon className="h-[17px] w-[17px] shrink-0" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3 flex-shrink-0">
          {!collapsed ? (
            <div className="mb-2.5 flex items-center gap-2.5 rounded-md border border-sidebar-border bg-[#1F3854]/70 p-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground font-semibold text-xs border border-sidebar-border">
                {initials(user.full_name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-sidebar-foreground">{user.full_name}</p>
                <p className="truncate text-[10px] text-sidebar-muted">{roleLabels[user.role]}</p>
              </div>
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground", collapsed && "px-0")}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed ? "Collapse sidebar" : null}
          </Button>
        </div>
      </aside>
    </>
  );
}
