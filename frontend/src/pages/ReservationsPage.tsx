import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Availability, Equipment, Page, Reservation } from "@/types";
import { formatDate, formatTime, percent, todayInput } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/states";
import { ReservationDetailDialog } from "@/components/common/reservation-detail-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

const reservationSchema = z
  .object({
    equipment_id: z.coerce.number().min(1, "Select equipment."),
    quantity: z.coerce.number().int().min(1, "At least one unit is required.").max(50),
    reservation_date: z.string().min(1, "Select a date."),
    start_time: z.string().min(1, "Select a start time."),
    end_time: z.string().min(1, "Select an end time."),
    purpose: z.string().max(500).optional(),
  })
  .refine((values) => values.end_time > values.start_time, { message: "End time must be after the start time.", path: ["end_time"] })
  .refine((values) => values.reservation_date >= todayInput(), { message: "Reservation date cannot be in the past.", path: ["reservation_date"] });

type ReservationFormValues = z.infer<typeof reservationSchema>;

const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Rejected" },
];

export function ReservationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(Boolean(searchParams.get("equipment")));
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const borrower = user?.role === "student" || user?.role === "faculty";
  const staff = user?.role === "admin" || user?.role === "lab_assistant";

  const weekEnd = addDays(weekStart, 6);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const reservationsQuery = useQuery({
    queryKey: ["reservations", "week", toDateInput(weekStart), status, search],
    queryFn: () =>
      api.get<Page<Reservation>>("/reservations", {
        date_from: toDateInput(weekStart),
        date_to: toDateInput(weekEnd),
        status: status || undefined,
        search: search || undefined,
        page_size: 200,
      }),
  });

  const equipmentQuery = useQuery({
    queryKey: ["equipment", "reservation-options"],
    queryFn: () => api.get<Page<Equipment>>("/equipment", { page_size: 100, sort: "name" }),
    enabled: borrower,
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReservationFormValues>({
    resolver: zodResolver(reservationSchema),
    defaultValues: {
      equipment_id: Number(searchParams.get("equipment") ?? 0),
      quantity: 1,
      reservation_date: todayInput(),
      start_time: "09:00",
      end_time: "11:00",
      purpose: "",
    },
  });

  const equipmentId = watch("equipment_id");
  const reservationDate = watch("reservation_date");
  const startTime = watch("start_time");
  const endTime = watch("end_time");

  const availabilityQuery = useQuery({
    queryKey: ["equipment", "availability", "reservation", equipmentId, reservationDate, startTime, endTime],
    queryFn: () =>
      api.get<Availability>(`/equipment/${equipmentId}/availability`, {
        checked_date: reservationDate,
        start_time: startTime,
        end_time: endTime,
      }),
    enabled: Boolean(equipmentId) && Boolean(reservationDate) && Boolean(startTime) && Boolean(endTime) && endTime > startTime,
  });

  useEffect(() => {
    if (searchParams.get("equipment")) setCreateOpen(true);
  }, [searchParams]);

  const createMutation = useMutation({
    mutationFn: (values: ReservationFormValues) =>
      api.post<Reservation>("/reservations", {
        equipment_id: values.equipment_id,
        quantity: values.quantity,
        reservation_date: values.reservation_date,
        start_time: values.start_time,
        end_time: values.end_time,
        purpose: values.purpose || null,
      }),
    onSuccess: (reservation) => {
      toast.success(`Reservation ${reservation.reservation_code} submitted.`);
      setCreateOpen(false);
      reset({ equipment_id: 0, quantity: 1, reservation_date: todayInput(), start_time: "09:00", end_time: "11:00", purpose: "" });
      const next = new URLSearchParams(searchParams);
      next.delete("equipment");
      setSearchParams(next, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ["reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to create the reservation."),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const reservation of reservationsQuery.data?.items ?? []) {
      const key = reservation.reservation_date;
      map.set(key, [...(map.get(key) ?? []), reservation]);
    }
    return map;
  }, [reservationsQuery.data]);

  const openDetail = (reservation: Reservation) => {
    setSelected(reservation);
    setDetailOpen(true);
  };

  const weekLabel = `${formatDate(toDateInput(weekStart))} – ${formatDate(toDateInput(weekEnd))}`;
  const selectedEquipment = equipmentQuery.data?.items.find((item) => item.id === equipmentId);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Scheduling"
        title="Reservation calendar"
        description={staff ? "Review booking requests, approve conflict-free slots and monitor laboratory usage." : "Reserve equipment for a specific date and time. The system prevents overlapping bookings."}
        actions={borrower ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New reservation</Button> : undefined}
      />

      <Card className="mb-5">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon-sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-[210px] text-center">
              <p className="text-[13px] font-semibold text-foreground">{weekLabel}</p>
              <p className="text-[10.5px] text-foreground-muted">Weekly reservation schedule</p>
            </div>
            <Button variant="secondary" size="icon-sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reservation or borrower…" className="w-full pl-9 sm:w-64" />
            </div>
            <Select value={status} onChange={(event) => setStatus(event.target.value)} className="sm:w-40" aria-label="Filter reservations by status">
              {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Week at a glance</CardTitle>
              <CardDescription>Select a booking to view details or take action.</CardDescription>
            </div>
            <span className="text-[11px] text-foreground-muted">{reservationsQuery.data?.total ?? 0} bookings</span>
          </div>
        </CardHeader>
        {reservationsQuery.isLoading ? (
          <div className="p-8 text-center text-[11px] text-foreground-muted">Loading reservation calendar…</div>
        ) : reservationsQuery.isError ? (
          <div className="p-4"><ErrorState message={reservationsQuery.error instanceof Error ? reservationsQuery.error.message : undefined} onRetry={() => void reservationsQuery.refetch()} /></div>
        ) : (
          <div className="grid min-w-[760px] grid-cols-7 divide-x border-border overflow-x-auto">
            {weekDays.map((day) => {
              const key = toDateInput(day);
              const isToday = key === todayInput();
              const dayReservations = grouped.get(key) ?? [];
              return (
                <div key={key} className={`min-h-[240px] ${isToday ? "bg-warm-100/20" : ""}`}>
                  <div className={`border-b border-border px-2.5 py-2 ${isToday ? "bg-warm-100/25" : "bg-card/60"}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">{day.toLocaleDateString("en-US", { weekday: "short" })}</p>
                    <p className={`text-[15px] font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>{day.getDate()}</p>
                  </div>
                  <div className="space-y-1.5 p-1.5">
                    {dayReservations.length === 0 ? (
                      <p className="px-1 py-2 text-[10px] text-foreground-muted">No bookings</p>
                    ) : (
                      dayReservations.map((reservation) => (
                        <button
                          key={reservation.id}
                          onClick={() => openDetail(reservation)}
                          className={`w-full rounded border px-1.5 py-1 text-left transition-opacity hover:opacity-60 ${reservation.status === "pending" ? "border-warning bg-warning-faint text-foreground-warning" : reservation.status === "approved" ? "border-primary bg-warm-100/20 text-foreground" : reservation.status === "completed" ? "border-success bg-success-faint text-success-foreground" : reservation.status === "cancelled" ? "border-muted bg-muted-faint text-foreground-muted" : reservation.status === "rejected" ? "border-danger bg-danger-faint text-foreground" : ""}`}
                        >
                          <p className="text-[9.5px] font-semibold">{formatTime(reservation.start_time)}–{formatTime(reservation.end_time)}</p>
                          <p className="mt-0.5 line-clamp-2 text-[10px] leading-3.5">{reservation.equipment.name}</p>
                          {staff ? <p className="mt-0.5 truncate text-[9px] text-foreground-muted opacity-60">{reservation.user?.full_name}</p> : null}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="mt-5 overflow-hidden">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Reservations this week</CardTitle>
              <CardDescription>All bookings from {weekLabel}.</CardDescription>
            </div>
            <span className="text-[11px] text-foreground-muted">{reservationsQuery.data?.total ?? 0} bookings</span>
          </div>
        </CardHeader>
        {reservationsQuery.isLoading ? (
          <div className="p-8 text-center text-[11px] text-foreground-muted">Loading reservations…</div>
        ) : (reservationsQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title={borrower ? "No reservations this week" : "No reservations this week"}
            description={borrower ? "Create a reservation to book equipment for a laboratory session." : "No bookings have been made for this week."}
            icon={CalendarDays}
            action={borrower ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New reservation</Button> : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reservation</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead className="hidden md:table-cell">Reserved by</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="hidden sm:table-cell">Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservationsQuery.data?.items.map((reservation) => (
                <TableRow key={reservation.id} className="cursor-pointer" onClick={() => openDetail(reservation)}>
                  <TableCell className="font-mono text-[11px] font-medium text-foreground">{reservation.reservation_code}</TableCell>
                  <TableCell>
                    <p className="text-[12.5px] font-medium text-foreground">{reservation.equipment.name}</p>
                    <p className="font-mono text-[10px] text-foreground-muted">{reservation.equipment.asset_tag}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-[12px] text-foreground-muted">{reservation.user?.full_name}</TableCell>
                  <TableCell className="text-[12px] text-foreground-muted">{formatDate(reservation.reservation_date)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-[12px] text-foreground-muted">{formatTime(reservation.start_time)} – {formatTime(reservation.end_time)}</TableCell>
                  <TableCell><StatusBadge status={reservation.status} /></TableCell>
                  <TableCell className="text-right"><Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); openDetail(reservation); }}>View</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="mt-3 text-[11px] text-foreground-muted">
        <Clock3 className="h-3.5 w-3.5" /> Pending and approved reservations both consume slot capacity to prevent double booking.
      </p>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New equipment reservation</DialogTitle>
            <DialogDescription>Reserve a conflict-free slot for laboratory work. Requests are reviewed by staff.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((values) => createMutation.mutate(values))} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="reservation-equipment">Equipment *</Label>
              <Select id="reservation-equipment" {...register("equipment_id")}>
                <option value={0}>Select equipment…</option>
                {(equipmentQuery.data?.items ?? []).map((equipment) => (
                  <option key={equipment.id} value={equipment.id}>{equipment.name} — {equipment.asset_tag}</option>
                ))}
              </Select>
              {errors.equipment_id ? <p className="text-[10px] text-foreground-danger">{errors.equipment_id.message}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="reservation-date">Date *</Label>
                <Input id="reservation-date" type="date" min={todayInput()} {...register("reservation_date")} />
                {errors.reservation_date ? <p className="text-[10px] text-foreground-danger">{errors.reservation_date.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reservation-quantity">Quantity *</Label>
                <Input id="reservation-quantity" type="number" min={1} max={50} {...register("quantity")} />
                {errors.quantity ? <p className="text-[10px] text-foreground-danger">{errors.quantity.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reservation-start">Start time *</Label>
                <Input id="reservation-start" type="time" {...register("start_time")} />
                {errors.start_time ? <p className="text-[10px] text-foreground-danger">{errors.start_time.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reservation-end">End time *</Label>
                <Input id="reservation-end" type="time" {...register("end_time")} />
                {errors.end_time ? <p className="text-[10px] text-foreground-danger">{errors.end_time.message}</p> : null}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reservation-purpose">Purpose</Label>
              <Textarea id="reservation-purpose" rows={3} placeholder="Laboratory session, project or course activity…" {...register("purpose")} />
            </div>

            {availabilityQuery.data ? (
              <Alert variant={availabilityQuery.data.available_quantity > 0 ? "success" : "danger"} title={`${availabilityQuery.data.available_quantity} of ${availabilityQuery.data.total_quantity} units available for this window`}>
                {selectedEquipment ? `${selectedEquipment.name} · ` : ""}{percent(availabilityQuery.data.available_quantity, availabilityQuery.data.total_quantity)}% capacity available. Reservations are validated again when submitted.
              </Alert>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                {isSubmitting || createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                Submit reservation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ReservationDetailDialog reservation={selected} open={detailOpen} onOpenChange={setDetailOpen} onUpdated={(updated) => setSelected(updated)} />
    </div>
  );
}