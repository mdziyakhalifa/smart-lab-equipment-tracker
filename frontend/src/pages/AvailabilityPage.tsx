import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Gauge,
  MapPin,
  Search,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Availability, Equipment, Page } from "@/types";
import { formatDate, formatTime, humanize, percent, todayInput } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { EquipmentThumb } from "@/components/common/equipment-thumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AvailabilityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [equipmentId, setEquipmentId] = useState(searchParams.get("equipment") ?? "");
  const [date, setDate] = useState(searchParams.get("date") ?? todayInput());
  const [startTime, setStartTime] = useState(searchParams.get("start_time") ?? "");
  const [endTime, setEndTime] = useState(searchParams.get("end_time") ?? "");

  useEffect(() => {
    const next = new URLSearchParams();
    if (equipmentId) next.set("equipment", equipmentId);
    if (date) next.set("date", date);
    if (startTime) next.set("start_time", startTime);
    if (endTime) next.set("end_time", endTime);
    setSearchParams(next, { replace: true });
  }, [equipmentId, date, startTime, endTime, setSearchParams]);

  const equipmentQuery = useQuery({
    queryKey: ["equipment", "availability-list", debouncedSearch],
    queryFn: () => api.get<Page<Equipment>>("/equipment", { search: debouncedSearch || undefined, page_size: 100, sort: "name" }),
  });

  const slotValid = Boolean((!startTime && !endTime) || (startTime && endTime && endTime > startTime));

  const availabilityQuery = useQuery({
    queryKey: ["equipment", "availability", equipmentId, date, startTime, endTime],
    queryFn: () =>
      api.get<Availability>(`/equipment/${equipmentId}/availability`, {
        checked_date: date || undefined,
        start_time: startTime || undefined,
        end_time: endTime || undefined,
      }),
    enabled: Boolean(equipmentId) && slotValid,
  });

  const selected = equipmentQuery.data?.items.find((item) => String(item.id) === equipmentId);
  const availability = availabilityQuery.data;
  const slotLabel = startTime && endTime ? `${formatDate(date)} · ${formatTime(startTime)}–${formatTime(endTime)}` : "Current live availability";

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Availability"
        title="Check equipment availability"
        description="Verify unit availability for a specific date and time window before creating a reservation or borrowing request."
        actions={<Button variant="secondary" asChild><Link to="/reservations"><CalendarClock className="h-4 w-4" /> Reservation calendar</Link></Button>}
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Slot checker</CardTitle>
            <CardDescription>Select equipment and an optional time window.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="equipment">Equipment</Label>
              <Select id="equipment" value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}>
                <option value="">Select equipment…</option>
                {(equipmentQuery.data?.items ?? []).map((equipment) => (
                  <option key={equipment.id} value={equipment.id}>{equipment.name} · {equipment.asset_tag}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} min={todayInput()} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start">Start time</Label>
                <Input id="start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end">End time</Label>
                <Input id="end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </div>
            </div>
            {!slotValid ? (
              <p className="text-[10px] text-foreground-danger">End time must be after the start time, or leave both blank.</p>
            ) : null}
            <p className="text-[11px] leading-4 text-foreground-muted">
              Leave the times blank to check current availability. Selecting a window accounts for approved and pending reservations during that slot.
            </p>
            {equipmentId ? (
              <Button variant="secondary" className="w-full" onClick={() => setSearchParams(new URLSearchParams({ equipment: equipmentId, date, start_time: startTime, end_time: endTime }))}>
                <Gauge className="h-4 w-4" /> Refresh availability
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Availability result</CardTitle>
            <CardDescription>{slotLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {!equipmentId ? (
              <EmptyState compact title="No equipment selected" description="Choose an instrument to see unit availability, reservations and service blocks." icon={Gauge} />
            ) : availabilityQuery.isLoading ? (
              <div className="flex h-48 items-center justify-center text-[11px] text-foreground-muted">Checking availability…</div>
            ) : availabilityQuery.isError ? (
              <ErrorState message={availabilityQuery.error instanceof Error ? availabilityQuery.error.message : undefined} onRetry={() => void availabilityQuery.refetch()} />
            ) : availability ? (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <EquipmentThumb category={selected?.category?.name} className="h-11 w-11" />
                    <div>
                      <p className="text-[15px] font-semibold text-foreground">{selected?.name ?? `Equipment #${equipmentId}`}</p>
                      <p className="text-[11px] text-foreground-muted">{selected?.asset_tag} · {selected?.laboratory?.name ?? availability.location}</p>
                    </div>
                  </div>
                  <StatusBadge status={availability.status} />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    { label: "Total", value: availability.total_quantity },
                    { label: "Available", value: availability.available_quantity },
                    { label: "Borrowed", value: availability.borrowed_quantity },
                    { label: "Reserved", value: availability.reserved_quantity },
                    { label: "Unavailable", value: availability.damaged_quantity + availability.maintenance_quantity },
                  ].map((item) => (
                    <div key={item.label} className="rounded-md border border-border bg-card p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">{item.label}</p>
                      <p className="mt-0.5 text-xl font-semibold text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] text-foreground-muted">
                    <span>Available capacity</span>
                    <span>{percent(availability.available_quantity, availability.total_quantity)}%</span>
                  </div>
                  <Progress value={percent(availability.available_quantity, availability.total_quantity)} className="mt-1.5 h-2" indicatorClassName="secondary" />
                </div>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11.5px] text-foreground-muted">
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {availability.location}</span>
                  <span className="flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" /> Condition: {humanize(availability.condition)}</span>
                  <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Next calibration: {formatDate(availability.next_calibration_date)}</span>
                </div>

                {availability.available_quantity > 0 ? (
                  <Alert variant="success" className="mt-4" title="Equipment is available">
                    {availability.available_quantity} of {availability.total_quantity} units can be used for this slot.
                  </Alert>
                ) : (
                  <Alert variant="danger" className="mt-4" title="No units available">
                    All units are currently borrowed, reserved, damaged or under maintenance. Try another time window or equipment.
                  </Alert>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {availability.available_quantity > 0 ? (
                    <>
                      <Button size="sm" asChild><Link to={`/borrow?equipment=${equipmentId}`}>Request borrowing</Link></Button>
                      <Button size="sm" variant="secondary" asChild><Link to={`/reservations?equipment=${equipmentId}`}>Reserve a slot</Link></Button>
                    </>
                  ) : null}
                  <Button size="sm" variant="ghost" asChild><Link to={`/equipment/${equipmentId}`}>Open equipment record</Link></Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Inventory availability overview</h3>
            <p className="text-[12px] text-foreground-muted">Current availability across all equipment records.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search equipment…" className="pl-9" />
          </div>
        </div>
        {equipmentQuery.isLoading ? (
          <TableSkeleton rows={5} columns={4} />
        ) : equipmentQuery.isError ? (
          <div className="p-4"><ErrorState message={equipmentQuery.error instanceof Error ? equipmentQuery.error.message : undefined} onRetry={() => void equipmentQuery.refetch()} /></div>
        ) : (equipmentQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState compact title="No equipment found" description="Try a different search term." icon={Search} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment</TableHead>
                <TableHead className="hidden md:table-cell">Laboratory</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Next calibration</TableHead>
                <TableHead className="w-24 text-right">Check</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipmentQuery.data?.items.map((equipment) => (
                <TableRow key={equipment.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <EquipmentThumb category={equipment.category?.name} className="h-8 w-8" />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-foreground">{equipment.name}</p>
                        <p className="font-mono text-[10px] text-foreground-muted">{equipment.asset_tag}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-[12px] text-foreground-muted">{equipment.laboratory?.name ?? "—"}</TableCell>
                  <TableCell>
                    <span className={`text-[12.5px] font-semibold ${equipment.available_quantity > 0 ? "text-success" : "text-danger"}`}>{equipment.available_quantity}</span>
                    <span className="text-[11px] text-foreground-muted"> / {equipment.quantity}</span>
                  </TableCell>
                  <TableCell><StatusBadge status={equipment.status} /></TableCell>
                  <TableCell className="hidden sm:table-cell text-[11.5px] text-foreground-muted">{formatDate(equipment.next_calibration_date)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="secondary" size="sm" onClick={() => { setEquipmentId(String(equipment.id)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      <Clock3 className="h-3.5 w-3.5" /> Check
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-foreground-muted">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Availability is calculated from live asset statuses and reservation windows.
      </div>
    </div>
  );
}