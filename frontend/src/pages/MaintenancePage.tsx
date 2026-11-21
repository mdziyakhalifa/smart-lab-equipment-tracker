import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Plus, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Equipment, MaintenanceRecord, Page } from "@/types";
import { formatCurrency, formatDate, formatDateTime, humanize, todayInput } from "@/lib/utils";
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
import { Separator } from "@/components/ui/separator";

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
  z.number().min(0, "Cost cannot be negative.").optional(),
);

const maintenanceSchema = z.object({
  equipment_id: z.coerce.number().min(1, "Select equipment."),
  asset_id: z.preprocess((value) => (value === "" || value === null || value === undefined ? undefined : Number(value)), z.number().optional()),
  maintenance_type: z.enum(["preventive", "corrective", "inspection", "repair"]),
  title: z.string().min(3, "Enter a maintenance title.").max(160),
  description: z.string().max(2000).optional(),
  scheduled_date: z.string().min(1, "Select a scheduled date."),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
  technician: z.string().max(120).optional(),
  service_provider: z.string().max(160).optional(),
  cost: optionalNumber,
  notes: z.string().max(2000).optional(),
});

type MaintenanceFormValues = z.infer<typeof maintenanceSchema>;

const STATUS_OPTIONS = ["scheduled", "in_progress", "completed", "cancelled"];
const TYPE_OPTIONS = ["preventive", "corrective", "inspection", "repair"];

export function MaintenancePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<MaintenanceRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const staff = user?.role === "admin" || user?.role === "lab_assistant";

  const maintenanceQuery = useQuery({
    queryKey: ["maintenance", { status, type, search }],
    queryFn: () => api.get<Page<MaintenanceRecord>>("/maintenance", { status: status || undefined, maintenance_type: type || undefined, search: search || undefined, page_size: 100 }),
  });

  const equipmentQuery = useQuery({
    queryKey: ["equipment", "maintenance-options"],
    queryFn: () => api.get<Page<Equipment>>("/equipment", { page_size: 100, sort: "name" }),
  });

  const createForm = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      equipment_id: 0,
      asset_id: undefined,
      maintenance_type: "preventive",
      title: "",
      description: "",
      scheduled_date: todayInput(),
      status: "scheduled",
      technician: "",
      service_provider: "",
      cost: undefined,
      notes: "",
    },
  });
  const createEquipmentId = createForm.watch("equipment_id");
  const createEquipmentQuery = useQuery({
    queryKey: ["equipment", "detail", createEquipmentId],
    queryFn: () => api.get<Equipment>(`/equipment/${createEquipmentId}`),
    enabled: Boolean(createEquipmentId),
  });

  const updateForm = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      equipment_id: 0,
      maintenance_type: "preventive",
      title: "",
      scheduled_date: todayInput(),
      status: "scheduled",
    },
  });

  useEffect(() => {
    if (!selected) return;
    updateForm.reset({
      equipment_id: selected.equipment_id,
      asset_id: selected.asset_id ?? undefined,
      maintenance_type: selected.maintenance_type as MaintenanceFormValues["maintenance_type"],
      title: selected.title,
      description: selected.description ?? "",
      scheduled_date: selected.scheduled_date,
      status: selected.status as MaintenanceFormValues["status"],
      technician: selected.technician ?? "",
      service_provider: selected.service_provider ?? "",
      cost: selected.cost ?? undefined,
      notes: selected.notes ?? "",
    });
  }, [selected, updateForm]);

  const createMutation = useMutation({
    mutationFn: (values: MaintenanceFormValues) => api.post<MaintenanceRecord>("/maintenance", { ...values, asset_id: values.asset_id ?? null, cost: values.cost ?? null }),
    onSuccess: () => {
      toast.success("Maintenance record created.");
      setCreateOpen(false);
      createForm.reset({ equipment_id: 0, asset_id: undefined, maintenance_type: "preventive", title: "", description: "", scheduled_date: todayInput(), status: "scheduled", technician: "", service_provider: "", cost: undefined, notes: "" });
      void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to create the maintenance record."),
  });

  const updateMutation = useMutation({
    mutationFn: (values: MaintenanceFormValues) =>
      api.put<MaintenanceRecord>(`/maintenance/${selected!.id}`, {
        status: values.status,
        scheduled_date: values.scheduled_date,
        technician: values.technician || null,
        service_provider: values.service_provider || null,
        cost: values.cost ?? null,
        notes: values.notes || null,
        description: values.description || null,
      }),
    onSuccess: (updated) => {
      setSelected(updated);
      void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Maintenance record updated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to update the maintenance record."),
  });

  const records = maintenanceQuery.data?.items ?? [];
  const scheduled = records.filter((record) => record.status === "scheduled").length;
  const inProgress = records.filter((record) => record.status === "in_progress").length;
  const completed = records.filter((record) => record.status === "completed").length;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Operations"
        title="Maintenance"
        description="Plan preventive service, track repairs and keep equipment service history complete."
        actions={staff ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Schedule maintenance</Button> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Scheduled" value={scheduled} description="Upcoming maintenance tasks" icon={CalendarClock} tone="primary" />
        <StatCard title="In progress" value={inProgress} description="Equipment currently being serviced" icon={Wrench} tone="warning" />
        <StatCard title="Completed" value={completed} description="Closed maintenance records" icon={Wrench} tone="success" />
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search record, task or equipment…" className="pl-9" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={status} onChange={(event) => setStatus(event.target.value)} className="sm:w-40" aria-label="Filter by status">
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </Select>
            <Select value={type} onChange={(event) => setType(event.target.value)} className="sm:w-40" aria-label="Filter by type">
              <option value="">All types</option>
              {TYPE_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </Select>
          </div>
        </div>

        {maintenanceQuery.isLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : maintenanceQuery.isError ? (
          <div className="p-4"><ErrorState message={maintenanceQuery.error instanceof Error ? maintenanceQuery.error.message : undefined} onRetry={() => void maintenanceQuery.refetch()} /></div>
        ) : records.length === 0 ? (
          <EmptyState
            title="No maintenance records found"
            description={staff ? "Schedule preventive service or log a repair to start building the service history." : "No maintenance records match the current filters."}
            icon={Wrench}
            action={staff ? <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> Schedule maintenance</Button> : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Record</TableHead>
                <TableHead className="min-w-[190px]">Equipment</TableHead>
                <TableHead>Task</TableHead>
                <TableHead className="hidden lg:table-cell">Type</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead className="hidden md:table-cell">Technician</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id} className="cursor-pointer" onClick={() => { setSelected(record); setDetailOpen(true); }}>
                  <TableCell className="font-mono text-[11px] font-medium text-foreground">{record.maintenance_code}</TableCell>
                  <TableCell>
                    <p className="text-[12.5px] font-medium text-foreground">{record.equipment.name}</p>
                    <p className="font-mono text-[10px] text-foreground-muted">{record.equipment.asset_tag}</p>
                  </TableCell>
                  <TableCell className="text-[12.5px] text-foreground">{record.title}</TableCell>
                  <TableCell className="hidden lg:table-cell text-[11.5px] text-foreground-muted">{humanize(record.maintenance_type)}</TableCell>
                  <TableCell className="text-[12px] text-foreground-muted">{formatDate(record.scheduled_date)}</TableCell>
                  <TableCell className="hidden md:table-cell text-[11.5px] text-foreground-muted">{record.technician ?? record.service_provider ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={record.status} /></TableCell>
                  <TableCell className="text-right"><Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); setSelected(record); setDetailOpen(true); }}>View</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Schedule maintenance</DialogTitle>
            <DialogDescription>Create a maintenance task. Starting a task marks the selected unit as under maintenance.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit((values) => createMutation.mutate(values))} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="maintenance-equipment">Equipment *</Label>
                <Select id="maintenance-equipment" {...createForm.register("equipment_id")}>
                  <option value={0}>Select equipment…</option>
                  {(equipmentQuery.data?.items ?? []).map((equipment) => <option key={equipment.id} value={equipment.id}>{equipment.name} — {equipment.asset_tag}</option>)}
                </Select>
                {createForm.formState.errors.equipment_id ? <p className="text-[10px] text-foreground-danger">{createForm.formState.errors.equipment_id.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maintenance-asset">Specific asset (optional)</Label>
                <Select id="maintenance-asset" {...createForm.register("asset_id")}>
                  <option value="">Not specified</option>
                  {(createEquipmentQuery.data?.assets ?? []).map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_code} · {asset.status}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maintenance-type">Type *</Label>
                <Select id="maintenance-type" {...createForm.register("maintenance_type")}>
                  {TYPE_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maintenance-date">Scheduled date *</Label>
                <Input id="maintenance-date" type="date" {...createForm.register("scheduled_date")} />
                {createForm.formState.errors.scheduled_date ? <p className="text-[10px] text-foreground-danger">{createForm.formState.errors.scheduled_date.message}</p> : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="maintenance-title">Task title *</Label>
                <Input id="maintenance-title" placeholder="e.g. Annual preventive service" {...createForm.register("title")} />
                {createForm.formState.errors.title ? <p className="text-[10px] text-foreground-danger">{createForm.formState.errors.title.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maintenance-status">Initial status</Label>
                <Select id="maintenance-status" {...createForm.register("status")}>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In progress</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maintenance-cost">Estimated cost (USD)</Label>
                <Input id="maintenance-cost" type="number" min="0" step="0.01" {...createForm.register("cost")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maintenance-technician">Technician</Label>
                <Input id="maintenance-technician" placeholder="Internal technician" {...createForm.register("technician")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maintenance-provider">Service provider</Label>
                <Input id="maintenance-provider" placeholder="External provider" {...createForm.register("service_provider")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="maintenance-description">Description</Label>
                <Textarea id="maintenance-description" rows={3} placeholder="Scope of work, reported faults, parts required…" {...createForm.register("description")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} Create record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-xl">
          {selected ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle>{selected.maintenance_code}</DialogTitle>
                  <StatusBadge status={selected.status} />
                </div>
                <DialogDescription>{selected.equipment.name} · {selected.title}</DialogDescription>
              </DialogHeader>

              <div className="rounded-md border border-border p-4">
                <dl className="grid gap-x-5 gap-y-3 text-[12.5px] sm:grid-cols-2">
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Type</dt><dd className="mt-0.5 text-foreground">{humanize(selected.maintenance_type)}</dd></div>
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Scheduled</dt><dd className="mt-0.5 text-foreground">{formatDate(selected.scheduled_date)}</dd></div>
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Started</dt><dd className="mt-0.5 text-foreground">{formatDateTime(selected.started_at)}</dd></div>
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Completed</dt><dd className="mt-0.5 text-foreground">{formatDateTime(selected.completed_at)}</dd></div>
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Cost</dt><dd className="mt-0.5 text-foreground">{formatCurrency(selected.cost)}</dd></div>
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Asset</dt><dd className="mt-0.5 font-mono text-foreground-muted">{selected.asset?.asset_code ?? "Not specified"}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Description</dt><dd className="mt-0.5 whitespace-pre-wrap text-foreground">{selected.description || "No description provided."}</dd></div>
                </dl>
              </div>

              {staff ? (
                <form onSubmit={updateForm.handleSubmit((values) => updateMutation.mutate(values))} className="space-y-3 rounded-md border border-border bg-card/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Update record</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="update-status">Status</Label>
                      <Select id="update-status" {...updateForm.register("status")}>
                        {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="update-date">Scheduled date</Label>
                      <Input id="update-date" type="date" {...updateForm.register("scheduled_date")} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="update-technician">Technician</Label>
                      <Input id="update-technician" {...updateForm.register("technician")} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="update-cost">Cost (USD)</Label>
                      <Input id="update-cost" type="number" min="0" step="0.01" {...updateForm.register("cost")} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="update-notes">Notes</Label>
                    <Textarea id="update-notes" rows={3} {...updateForm.register("notes")} placeholder="Work performed, parts used, follow-up required…" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDetailOpen(false)}>Close</Button>
                    <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} Save changes
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={() => setDetailOpen(false)}>Close</Button></div>
              )}

              <Separator />
              <p className="text-[11px] text-foreground-muted">Created by {selected.created_by?.full_name ?? "system"} · {formatDateTime(selected.created_at)}</p>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}