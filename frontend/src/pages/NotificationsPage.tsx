import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle2,
  CheckCheck,
  ClipboardList,
  Gauge,
  Info,
  Package,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AppNotification, Page } from "@/types";
import { relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { Pagination } from "@/components/common/pagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

const TYPE_META: Record<string, { tone: string; label: string }> = {
  borrow: { tone: "primary", label: "Borrowing" },
  return: { tone: "success", label: "Return" },
  overdue: { tone: "danger", label: "Overdue" },
  reservation: { tone: "secondary", label: "Reservation" },
  maintenance: { tone: "warning", label: "Maintenance" },
  calibration: { tone: "primary", label: "Calibration" },
  low_stock: { tone: "warning", label: "Low stock" },
  damage: { tone: "danger", label: "Damage" },
  system: { tone: "muted", label: "System" },
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "page", { unreadOnly, type, page }],
    queryFn: () =>
      api.get<Page<AppNotification>>("/notifications", {
        unread_only: unreadOnly || undefined,
        notification_type: type || undefined,
        page,
        page_size: 20,
      }),
    placeholderData: (previous) => previous,
  });

  const countQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
  });

  const markAll = useMutation({
    mutationFn: () => api.put<{ message: string }>("/notifications/read-all"),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to mark notifications as read."),
  });

  const markOne = useMutation({
    mutationFn: (id: number) => api.put<AppNotification>(`/notifications/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to update the notification."),
  });

  const removeOne = useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/notifications/${id}`),
    onSuccess: () => {
      toast.success("Notification removed.");
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to delete the notification."),
  });

  const items = notificationsQuery.data?.items ?? [];
  const unreadCount = countQuery.data?.count ?? 0;
  const filtered = unreadOnly || Boolean(type);

  function openNotification(notification: AppNotification) {
    if (!notification.is_read) markOne.mutate(notification.id);
    if (notification.link) navigate(notification.link);
  }

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Activity"
        title="Notifications"
        description="Stay informed about borrowing decisions, returns, reservations, calibration, maintenance and stock levels."
        actions={
          <Button variant="secondary" onClick={() => markAll.mutate()} disabled={unreadCount === 0 || markAll.isPending}>
            <CheckCheck className="h-4 w-4" /> Mark all as read
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">
              {unreadOnly ? "Unread notifications" : "All notifications"}
            </h3>
            <p className="text-[12px] text-foreground-muted">{unreadCount} unread · {notificationsQuery.data?.total ?? 0} total</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="sm:w-44" aria-label="Filter by notification type">
              <option value="">All types</option>
              {Object.entries(TYPE_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </Select>
            <Button
              variant={unreadOnly ? "default" : "secondary"}
              size="sm"
              onClick={() => { setUnreadOnly((current) => !current); setPage(1); }}
            >
              <Bell className="h-3.5 w-3.5" /> Unread only
            </Button>
          </div>
        </div>

        {notificationsQuery.isLoading ? (
          <TableSkeleton rows={6} columns={3} />
        ) : notificationsQuery.isError ? (
          <div className="p-4"><ErrorState message={notificationsQuery.error instanceof Error ? notificationsQuery.error.message : undefined} onRetry={() => void notificationsQuery.refetch()} /></div>
        ) : items.length === 0 ? (
          <EmptyState
            title={filtered ? "No notifications match these filters" : "You're all caught up"}
            description={filtered ? "Try clearing the unread filter or selecting a different notification type." : "New activity relevant to you will appear here."}
            icon={filtered ? BellOff : CheckCircle2}
            action={filtered ? <Button variant="secondary" size="sm" onClick={() => { setUnreadOnly(false); setType(""); setPage(1); }}>Clear filters</Button> : undefined}
          />
        ) : (
          <>
            <div className="divide-y border-border">
              {items.map((notification) => {
                const meta = TYPE_META[notification.notification_type] ?? TYPE_META.system;
                return (
                  <div
                    key={notification.id}
                    className={`group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-card/70 ${notification.is_read ? "" : "bg-warm-100/20"}`}
                  >
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                      <Bell className="h-4 w-4" />
                    </div>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-[13px] ${notification.is_read ? "font-medium text-foreground-muted" : "font-semibold text-foreground"}`}>{notification.title}</p>
                        {!notification.is_read ? <span className="h-1.5 w-1.5 rounded-md bg-foreground" /> : null}
                        <span className="rounded border border-border px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-foreground-muted">{meta.label}</span>
                      </div>
                      <p className="mt-0.5 text-[12px] leading-5 text-foreground-muted">{notification.message}</p>
                      <p className="mt-1 text-[10.5px] text-foreground-muted">{relativeTime(notification.created_at)}</p>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {!notification.is_read ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Mark as read"
                          title="Mark as read"
                          onClick={() => markOne.mutate(notification.id)}
                          disabled={markOne.isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-foreground-muted" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete notification"
                        title="Delete notification"
                        className="text-foreground-muted hover:bg-card/50 hover:text-foreground"
                        onClick={() => removeOne.mutate(notification.id)}
                        disabled={removeOne.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            {notificationsQuery.data ? (
              <Pagination
                page={notificationsQuery.data.page}
                pages={notificationsQuery.data.pages}
                total={notificationsQuery.data.total}
                pageSize={notificationsQuery.data.page_size}
                onPageChange={setPage}
                itemLabel="notifications"
              />
            ) : null}
          </>
        )}
      </Card>

      <p className="mt-3 text-[11px] text-foreground-muted">
        Notifications are generated by borrowing, reservation, maintenance, calibration and stock workflows. Select a notification to open the related record.
      </p>
    </div>
  );
}