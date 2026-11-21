import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { CalibrationRecord, CalibrationScheduleItem, Equipment, Page } from "@/types";
import { addDaysInput, formatDate, humanize, todayInput } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";

const calibrationSchema = z
  .object({
    equipment_id: z.coerce.number().min(1, "Select equipment."),
    calibration_date: z.string().min(1, "Select the calibration date."),
    next_due_date: z.string().min(1, "Select the next due date."),
    result: z.enum(["passed", "adjusted", "failed"]),
    technician: z.string().max(120).optional(),
    service_provider: z.string().max(160).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((values) => values.next_due_date > values.calibration_date, {
    message: "Next due date must be after the calibration date.",
    path: ["next_due_date"],
  });

type CalibrationFormValues = z.infer<typeof calibrationSchema>;

const SCHEDULE_FILTERS = [
  { value: "all", label: "All calibration-tracked equipment" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due within 30 days" },
  { value: "upcoming", label: "Upcoming" },
];

const RESULT_FILTERS = ["passed", "adjusted", "failed"];

function ScheduleStatus({ item }: { item: CalibrationScheduleItem }) {
  const tone =
    item.calibration_status === "overdue"
      ? "border-danger bg-danger-faint text-foreground-danger"
      : item.calibration_status === "due_soon"
      ? "border-warning bg-warning-faint text-foreground-warning"
      : "border-success bg-success-faint text-success-foreground";
  const label =
    item.calibration_status === "overdue"
      ? `${Math.abs(item.days_until)} days overdue`
      : item.calibration_status === "due_soon"
      ? `Due in ${item.days_until} days`
      : `Due in ${item.days_until} days`;
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${tone}`}>{label}</span>;
}

export function CalibrationPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scheduleFilter, setScheduleFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("");
  const [search, setSearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [recordOpen, setRecordOpen] = useState(Boolean(searchParams.get("equipment")));
  const staff = user?.role === "admin" || user?.role === "lab_assistant";

  const scheduleQuery = useQuery({
    queryKey: ["calibrations", "schedule", scheduleFilter],
    queryFn: () =>
      api.get<{ items: CalibrationScheduleItem[]; total: number }>("/calibrations/schedule", {
        status: scheduleFilter === "all" ? undefined : scheduleFilter,
      }),
  });

  const historyQuery = useQuery({
    queryKey: ["calibrations", "history", resultFilter, historyPage],
    queryFn: () => api.get<Page<CalibrationRecord>>("/calibrations", { result: resultFilter || undefined, page: historyPage, page_size: 10 }),
    placeholderData: (previous) => previous,
  });

  const equipmentQuery = useQuery({
    queryKey: ["equipment", "calibration-options"],
    queryFn: () => api.get<Page<Equipment>>("/equipment", { page_size: 100, sort: "name" }),
    enabled: staff,
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CalibrationFormValues>({
    resolver: zodResolver(calibrationSchema),
    defaultValues: {
      equipment_id: Number(searchParams.get("equipment") ?? 0),
      calibration_date: todayInput(),
      next_due_date: addDaysInput(365),
      result: "passed",
      technician: "",
      service_provider: "",
      notes: "",
    },
  });

  const selectedEquipmentId = watch("equipment_id");

  useEffect(() => {
    if (!searchParams.get("equipment")) return;
    setRecordOpen(true);
    setValue("equipment_id", Number(searchParams.get("equipment")), { shouldValidate: true });
  }, [searchParams, setValue]);

  const createMutation = useMutation({
    mutationFn: (values: CalibrationFormValues) =>
      api.post<CalibrationRecord>("/calibrations", {
        ...values,
        technician: values.technician || null,
        service_provider: values.service_provider || null,
        notes: values.notes || null,
      }),
    onSuccess: (record) => {
      toast.success(`Calibration ${record.calibration_code} recorded.`);
      setRecordOpen(false);
      reset({ equipment_id: 0, calibration_date: todayInput(), next_due_date: addDaysInput(365), result: "passed", technician: "", service_provider: "", notes: "" });
      const next = new URLSearchParams(searchParams);
      next.delete("equipment");
      setSearchParams(next, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ["calibrations"] });
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to record the calibration."),
  });

  const scheduleItems = scheduleQuery.data?.items ?? [];
  const filteredSchedule = scheduleItems.filter((item) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return item.name.toLowerCase().includes(term) || item.asset_tag.toLowerCase().includes(term) || (item.laboratory ?? "").toLowerCase().includes(term);
  });
  const overdue = scheduleItems.filter((item) => item.calibration_status === "overdue").length;
  const dueSoon = scheduleItems.filter((item) => item.calibration_status === "due_soon").length;
  const upcoming = scheduleItems.filter((item) => item.calibration_status === "upcoming").length;
  const selectedEquipment = equipmentQuery.data?.items.find((item) => item.id === selectedEquipmentId);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Compliance"
        title="Calibration"
        description="Track calibration due dates, record instrument calibration and maintain an auditable service history."
        actions={
          <>
            <Button variant="secondary" asChild><Link to="/reports?report=calibration"><ClipboardCheck className="h-4 w-4" /> Compliance report</Link></Button>
            {staff ? <Button onClick={() => setRecordOpen(true)}><Plus className="h-4 w-4" /> Record calibration</Button> : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Overdue" value={overdue} description="Instruments past their calibration due date" icon={AlertTriangle} tone="danger" />
        <StatCard title="Due within 30 days" value={dueSoon} description="Calibration required soon" icon={Timer} tone="warning" />
        <StatCard title="Upcoming" value={upcoming} description="Calibration scheduled beyond 30 days" icon={CalendarClock} tone="primary" />
        <StatCard title="Tracked instruments" value={scheduleItems.length} description="Active equipment requiring calibration" icon={Gauge} tone="navy" />
      </div>

      {overdue > 0 ? (
        <Alert variant="danger" className="mt-5" title={`${overdue} instrument${overdue === 1 ? "" : "s"} overdue for calibration`}>
          Overdue instruments should be withdrawn from service until calibration is completed and recorded.
        </Alert>
      ) : null}

      <Card className="mt-5 overflow-hidden">
        <Tabs defaultValue="schedule">
          <TabsList>
            <TabsTrigger value="schedule">Compliance schedule</TabsTrigger>
            <TabsTrigger value="history">Calibration history</TabsTrigger>
          </TabsList>
          <TabsContent value="schedule" className="mt-0">
            {scheduleQuery.isLoading ? (
              <TableSkeleton rows={6} columns={6} />
            ) : scheduleQuery.isError ? (
              <div className="p-4"><ErrorState message={scheduleQuery.error instanceof Error ? scheduleQuery.error.message : undefined} onRetry={() => void scheduleQuery.refetch()} /></div>
            ) : filteredSchedule.length === 0 ? (
              <EmptyState
                title="No calibration records match"
                description={search ? "Try a different search term or filter." : "No active equipment currently requires calibration tracking."}
                icon={ShieldCheck}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instrument</TableHead>
                    <TableHead className="hidden lg:table-cell">Category</TableHead>
                    <TableHead className="hidden md:table-cell">Laboratory</TableHead>
                    <TableHead>Last calibrated</TableHead>
                    <TableHead>Next due</TableHead>
                    <TableHead>Compliance</TableHead>
                    <TableHead className="w-32 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedule.map((item) => (
                    <TableRow key={item.equipment_id}>
                      <TableCell>
                        <Link to={`/equipment/${item.equipment_id}`} className="text-[12.5px] font-medium text-foreground hover:text-primary hover:underline">{item.name}</Link>
                        <p className="font-mono text-[10px] text-foreground-muted">{item.asset_tag}</p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-[11.5px] text-foreground-muted">{item.category ?? "—"}</TableCell>
                      <TableCell className="hidden md:table-cell text-[11.5px] text-foreground-muted">{item.laboratory ?? "—"}</TableCell>
                      <TableCell className="text-[11.5px] text-foreground-muted">{formatDate(item.last_calibration_date)}</TableCell>
                      <TableCell className="text-[11.5px] font-medium text-foreground">{formatDate(item.next_calibration_date)}</TableCell>
                      <TableCell><ScheduleStatus item={item} /></TableCell>
                      <TableCell className="text-right">
                        {staff ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setValue("equipment_id", item.equipment_id, { shouldValidate: true });
                              setValue("calibration_date", todayInput());
                              setValue("next_due_date", addDaysInput(365));
                              setRecordOpen(true);
                            }}
                          >
                            <Gauge className="h-3.5 w-3.5" /> Record
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" asChild><Link to={`/equipment/${item.equipment_id}`}>View</Link></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="history">
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] text-foreground-muted">Completed calibration records, retained for audit and compliance.</p>
              <Select value={resultFilter} onChange={(event) => { setResultFilter(event.target.value); setHistoryPage(1); }} className="sm:w-44" aria-label="Filter calibration result">
                <option value="">All results</option>
                {RESULT_FILTERS.map((result) => <option key={result} value={result}>{humanize(result)}</option>)}
              </Select>
            </div>
            {historyQuery.isLoading ? (
              <TableSkeleton rows={6} columns={6} />
            ) : historyQuery.isError ? (
              <div className="p-4"><ErrorState message={historyQuery.error instanceof Error ? historyQuery.error.message : undefined} onRetry={() => void historyQuery.refetch()} /></div>
            ) : (historyQuery.data?.items.length ?? 0) === 0 ? (
              <EmptyState title="No calibration history" description="Calibration records will appear here once staff record them." icon={Gauge} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Record</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead className="hidden md:table-cell">Calibrated</TableHead>
                    <TableHead>Next due</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="hidden lg:table-cell">Technician / provider</TableHead>
                    <TableHead className="hidden xl:table-cell">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyQuery.data?.items.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono text-[11px] font-medium text-foreground">{record.calibration_code}</TableCell>
                      <TableCell>
                        <Link to={`/equipment/${record.equipment_id}`} className="text-[12.5px] font-medium text-foreground hover:text-primary hover:underline">{record.equipment.name}</Link>
                        <p className="font-mono text-[10px] text-foreground-muted">{record.equipment.asset_tag}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-[11.5px] text-foreground-muted">{formatDate(record.calibration_date)}</TableCell>
                      <TableCell className="text-[11.5px] text-foreground-muted">{formatDate(record.next_due_date)}</TableCell>
                      <TableCell><StatusBadge status={record.result} /></TableCell>
                      <TableCell className="hidden lg:table-cell text-[11.5px] text-foreground-muted">{record.technician ?? record.service_provider ?? "—"}</TableCell>
                      <TableCell className="hidden xl:table-cell max-w-[260px] truncate text-[11px] text-foreground-muted">{record.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
              <p className="text-xs text-foreground-muted">Showing page {historyQuery.data?.page} of {historyQuery.data?.pages} · {historyQuery.data?.total} records</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}>Previous</Button>
                <Button variant="secondary" size="sm" disabled={historyPage >= (historyQuery.data?.pages ?? 1)} onClick={() => setHistoryPage((current) => current + 1)}>Next</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-foreground-muted">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        Recording a calibration updates the instrument's last and next calibration dates automatically.
      </p>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record calibration</DialogTitle>
            <DialogDescription>Log the calibration outcome and schedule the next due date.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((values) => createMutation.mutate(values))} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="calibration-equipment">Instrument *</Label>
              <Select id="calibration-equipment" {...register("equipment_id")}>
                <option value={0}>Select equipment…</option>
                {(equipmentQuery.data?.items ?? []).map((equipment) => (
                  <option key={equipment.id} value={equipment.id}>{equipment.name} — {equipment.asset_tag}</option>
                ))}
              </Select>
              {errors.equipment_id ? <p className="text-[10px] text-foreground-danger">{errors.equipment_id.message}</p> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="calibration-date">Calibration date *</Label>
                <Input id="calibration-date" type="date" max={todayInput()} {...register("calibration_date")} />
                {errors.calibration_date ? <p className="text-[10px] text-foreground-danger">{errors.calibration_date.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="next-due-date">Next due date *</Label>
                <Input id="next-due-date" type="date" {...register("next_due_date")} />
                {errors.next_due_date ? <p className="text-[10px] text-foreground-danger">{errors.next_due_date.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="calibration-result">Result *</Label>
                <Select id="calibration-result" {...register("result")}>
                  <option value="passed">Passed</option>
                  <option value="adjusted">Adjusted</option>
                  <option value="failed">Failed</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="calibration-technician">Technician</Label>
                <Input id="calibration-technician" placeholder="Internal technician" {...register("technician")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calibration-provider">Service provider</Label>
              <Input id="calibration-provider" placeholder="External calibration provider" {...register("service_provider")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calibration-notes">Notes</Label>
              <Textarea id="calibration-notes" rows={3} placeholder="Tolerance results, adjustments made, certificate number…" {...register("notes")} />
            </div>
            {selectedEquipment ? (
              <p className="rounded-md border border-border px-3 py-2 text-[11.5px] text-foreground-muted">
                {selectedEquipment.name} · Last calibrated {formatDate(selectedEquipment.last_calibration_date)} · Next due {formatDate(selectedEquipment.next_calibration_date)}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setRecordOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                {isSubmitting || createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
                Record calibration
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}