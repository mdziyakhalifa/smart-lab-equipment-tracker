import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, CalendarDays, Clock3, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Page, Reservation } from "@/types";
import { formatDate, formatTime } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { ReservationDetailDialog } from "@/components/common/reservation-detail-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function MyReservationsPage() {
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const reservationsQuery = useQuery({
    queryKey: ["reservations", "mine", status],
    queryFn: () => api.get<Page<Reservation>>("/reservations", { mine: true, status: status || undefined, page_size: 100 }),
  });

  const items = reservationsQuery.data?.items ?? [];
  const pending = items.filter((item) => item.status === "pending").length;
  const approved = items.filter((item) => item.status === "approved").length;
  const completed = items.filter((item) => item.status === "completed").length;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Scheduling"
        title="My reservations"
        description="View your equipment bookings, check approval status and cancel upcoming slots when plans change."
        actions={<Button asChild><Link to="/reservations"><Plus className="h-4 w-4" /> New reservation</Link></Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Pending approval" value={pending} description="Awaiting laboratory review" icon={Clock3} tone="warning" />
        <StatCard title="Approved" value={approved} description="Confirmed laboratory slots" icon={CalendarCheck2} tone="success" />
        <StatCard title="Completed" value={completed} description="Past reservation sessions" icon={CalendarDays} tone="primary" />
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Reservation history</h3>
            <p className="text-[12px] text-foreground-muted">All reservations you have submitted.</p>
          </div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} className="sm:w-44" aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
        {reservationsQuery.isLoading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : reservationsQuery.isError ? (
          <div className="p-4"><ErrorState message={reservationsQuery.error instanceof Error ? reservationsQuery.error.message : undefined} onRetry={() => void reservationsQuery.refetch()} /></div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No reservations found"
            description={status ? "No reservations match this status filter." : "Reserve equipment for an upcoming laboratory session."}
            icon={CalendarDays}
            action={<Button size="sm" asChild><Link to="/reservations"><Plus className="h-3.5 w-3.5" /> Book equipment</Link></Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reservation</TableHead>
                <TableHead className="min-w-[190px]">Equipment</TableHead>
                <TableHead className="hidden sm:table-cell">Qty</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="hidden md:table-cell">Time window</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((reservation) => (
                <TableRow key={reservation.id} className="cursor-pointer" onClick={() => { setSelected(reservation); setDetailOpen(true); }}>
                  <TableCell className="font-mono text-[11px] font-medium text-foreground">{reservation.reservation_code}</TableCell>
                  <TableCell>
                    <p className="text-[12.5px] font-medium text-foreground">{reservation.equipment.name}</p>
                    <p className="font-mono text-[10px] text-foreground-muted">{reservation.equipment.asset_tag}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-[12px] text-foreground-muted">{reservation.quantity}</TableCell>
                  <TableCell className="text-[12px] text-foreground-muted">{formatDate(reservation.reservation_date)}</TableCell>
                  <TableCell className="hidden md:table-cell text-[12px] text-foreground-muted">{formatTime(reservation.start_time)} – {formatTime(reservation.end_time)}</TableCell>
                  <TableCell><StatusBadge status={reservation.status} /></TableCell>
                  <TableCell className="text-right"><Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); setSelected(reservation); setDetailOpen(true); }}>View</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="mt-3 text-[11px] text-foreground-muted">Pending and approved reservations both hold the slot. Cancel a reservation you no longer need to release capacity.</p>

      <ReservationDetailDialog reservation={selected} open={detailOpen} onOpenChange={setDetailOpen} onUpdated={(updated) => setSelected(updated)} />
    </div>
  );
}