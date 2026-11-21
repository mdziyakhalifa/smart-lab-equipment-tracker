import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { api, mediaUrl } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { DamageReport, Equipment, Page } from "@/types";
import { formatDateTime, humanize } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ImageUpload } from "@/components/common/image-upload";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

const reportSchema = z.object({
  equipment_id: z.coerce.number().min(1, "Select the affected equipment."),
  asset_id: z.preprocess((value) => (value === "" || value === null || value === undefined ? undefined : Number(value)), z.number().optional()),
  issue_category: z.string().min(2, "Enter an issue category.").max(80),
  description: z.string().min(5, "Describe the issue in at least 5 characters.").max(2000),
  priority: z.enum(["low", "medium", "high", "critical"]),
  image_url: z.string().nullable().optional(),
});

type ReportFormValues = z.infer<typeof reportSchema>;

const STATUS_OPTIONS = ["reported", "under_review", "approved", "under_repair", "resolved"];
const PRIORITIES = ["low", "medium", "high", "critical"];

export function DamageReportsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(Boolean(searchParams.get("equipment")));
  const [selected, setSelected] = useState<DamageReport | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("reported");
  const [updatePriority, setUpdatePriority] = useState("medium");
  const [resolution, setResolution] = useState("");
  const staff = user?.role === "admin" || user?.role === "lab_assistant";

  const reportsQuery = useQuery({
    queryKey: ["damage-reports", { status, priority, search }],
    queryFn: () =>
      api.get<Page<DamageReport>>("/damage-reports", {
        status: status || undefined,
        priority: priority || undefined,
        search: search || undefined,
        page_size: 100,
      }),
  });

  const equipmentQuery = useQuery({
    queryKey: ["equipment", "damage-options"],
    queryFn: () => api.get<Page<Equipment>>("/equipment", { page_size: 100, sort: "name" }),
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      equipment_id: Number(searchParams.get("equipment") ?? 0),
      asset_id: undefined,
      issue_category: "",
      description: "",
      priority: "medium",
      image_url: null,
    },
  });

  const selectedEquipmentId = watch("equipment_id");
  const imageUrl = watch("image_url");

  const equipmentDetailQuery = useQuery({
    queryKey: ["equipment", "detail", selectedEquipmentId],
    queryFn: () => api.get<Equipment>(`/equipment/${selectedEquipmentId}`),
    enabled: Boolean(selectedEquipmentId),
  });

  useEffect(() => {
    if (searchParams.get("equipment")) setCreateOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (!selected) return;
    setUpdateStatus(selected.status);
    setUpdatePriority(selected.priority);
    setResolution(selected.resolution_notes ?? "");
  }, [selected]);

  const createMutation = useMutation({
    mutationFn: (values: ReportFormValues) =>
      api.post<DamageReport>("/damage-reports", { ...values, asset_id: values.asset_id ?? null, image_url: values.image_url || null }),
    onSuccess: (report) => {
      toast.success(`Damage report ${report.report_code} submitted.`);
      setCreateOpen(false);
      reset({ equipment_id: 0, asset_id: undefined, issue_category: "", description: "", priority: "medium", image_url: null });
      const next = new URLSearchParams(searchParams);
      next.delete("equipment");
      setSearchParams(next, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ["damage-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to submit the report."),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.put<DamageReport>(`/damage-reports/${selected!.id}`, {
        status: updateStatus,
        priority: updatePriority,
        resolution_notes: resolution || null,
      }),
    onSuccess: (updated) => {
      setSelected(updated);
      void queryClient.invalidateQueries({ queryKey: ["damage-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Damage report updated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to update the report."),
  });

  const reports = reportsQuery.data?.items ?? [];
  const open = reports.filter((report) => report.status !== "resolved").length;
  const critical = reports.filter((report) => report.priority === "high" || report.priority === "critical").length;
  const resolved = reports.filter((report) => report.status === "resolved").length;
  const selectedEquipment = equipmentQuery.data?.items.find((item) => item.id === selectedEquipmentId);

  const openDetail = (report: DamageReport) => {
    setSelected(report);
    setDetailOpen(true);
  };

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Safety & condition"
        title="Damage reports"
        description="Report equipment faults, track review status and keep damaged assets out of circulation until repaired."
        actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Report an issue</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Open reports" value={open} description="Reported, under review or under repair" icon={AlertTriangle} tone="warning" />
        <StatCard title="High priority" value={critical} description="High and critical issues" icon={ShieldAlert} tone="danger" />
        <StatCard title="Resolved" value={resolved} description="Issues closed by laboratory staff" icon={CheckCircle2} tone="success" />
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report, equipment or reporter…" className="pl-9" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={status} onChange={(event) => setStatus(event.target.value)} className="sm:w-40" aria-label="Filter by status">
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </Select>
            <Select value={priority} onChange={(event) => setPriority(event.target.value)} className="sm:w-36" aria-label="Filter by priority">
              <option value="">All priorities</option>
              {PRIORITIES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </Select>
          </div>
        </div>

        {reportsQuery.isLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : reportsQuery.isError ? (
          <div className="p-4"><ErrorState message={reportsQuery.error instanceof Error ? reportsQuery.error.message : undefined} onRetry={() => void reportsQuery.refetch()} /></div>
        ) : reports.length === 0 ? (
          <EmptyState
            title="No damage reports found"
            description="No issues match the current filters. Report a fault if equipment needs attention."
            icon={AlertTriangle}
            action={<Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New report</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report</TableHead>
                <TableHead className="min-w-[190px]">Equipment</TableHead>
                <TableHead className="hidden md:table-cell">Asset</TableHead>
                <TableHead className="hidden lg:table-cell">Reported by</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Reported</TableHead>
                <TableHead className="w-20 text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id} className="cursor-pointer" onClick={() => openDetail(report)}>
                  <TableCell className="font-mono text-[11px] font-medium text-foreground">{report.report_code}</TableCell>
                  <TableCell>
                    <p className="text-[12.5px] font-medium text-foreground">{report.equipment.name}</p>
                    <p className="text-[10.5px] text-foreground-muted">{report.issue_category}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-[10.5px] text-foreground-muted">{report.asset?.asset_code ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-[12px] text-foreground-muted">{report.reporter?.full_name}</TableCell>
                  <TableCell><StatusBadge status={report.priority} /></TableCell>
                  <TableCell><StatusBadge status={report.status} /></TableCell>
                  <TableCell className="hidden sm:table-cell text-[11px] text-foreground-muted">{formatDateTime(report.created_at)}</TableCell>
                  <TableCell className="text-right"><Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); openDetail(report); }}>View</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Report an equipment issue</DialogTitle>
            <DialogDescription>Provide as much detail as possible so laboratory staff can assess the problem.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((values) => createMutation.mutate(values))} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="damage-equipment">Equipment *</Label>
              <Select id="damage-equipment" {...register("equipment_id")}>
                <option value={0}>Select equipment…</option>
                {(equipmentQuery.data?.items ?? []).map((equipment) => <option key={equipment.id} value={equipment.id}>{equipment.name} — {equipment.asset_tag}</option>)}
              </Select>
              {errors.equipment_id ? <p className="text-[10px] text-foreground-danger">{errors.equipment_id.message}</p> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="damage-asset">Specific asset (optional)</Label>
                <Select id="damage-asset" {...register("asset_id")}>
                  <option value="">Not specified</option>
                  {(equipmentDetailQuery.data?.assets ?? []).map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_code} · {asset.status}</option>)}
                </Select>
                <p className="text-[10px] text-foreground-muted">Select the individual unit if known.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="damage-priority">Priority *</Label>
                <Select id="damage-priority" {...register("priority")}>
                  {PRIORITIES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="damage-category">Issue category *</Label>
              <Input id="damage-category" placeholder="e.g. Power fault, cracked screen, missing accessory" {...register("issue_category")} />
              {errors.issue_category ? <p className="text-[10px] text-foreground-danger">{errors.issue_category.message}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="damage-description">Description *</Label>
              <Textarea id="damage-description" rows={4} placeholder="What happened? Include any error messages or observations…" {...register("description")} />
              {errors.description ? <p className="text-[10px] text-foreground-danger">{errors.description.message}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label>Photo (optional)</Label>
              <ImageUpload value={imageUrl} onChange={(url) => setValue("image_url", url)} label="Upload a photo of the issue" />
            </div>
            {selectedEquipment ? <p className="text-[10px] text-foreground-muted">Selected: {selectedEquipment.name} · {selectedEquipment.laboratory?.name ?? "No laboratory"}</p> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                {isSubmitting || createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                Submit report
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
                  <DialogTitle>{selected.report_code}</DialogTitle>
                  <StatusBadge status={selected.status} />
                  <StatusBadge status={selected.priority} />
                </div>
                <DialogDescription>{selected.equipment.name} · Reported {formatDateTime(selected.created_at)}</DialogDescription>
              </DialogHeader>

              <div className="rounded-md border border-border p-4">
                <dl className="grid gap-x-5 gap-y-3 text-[12.5px] sm:grid-cols-2">
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Equipment</dt><dd className="mt-0.5 text-foreground">{selected.equipment.name}</dd><dd className="font-mono text-[10.5px] text-foreground-muted">{selected.equipment.asset_tag}</dd></div>
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Asset</dt><dd className="mt-0.5 font-mono text-foreground-muted">{selected.asset?.asset_code ?? "Not specified"}</dd></div>
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Reported by</dt><dd className="mt-0.5 text-foreground">{selected.reporter?.full_name}</dd><dd className="text-[11px] text-foreground-muted">{selected.reporter?.email}</dd></div>
                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Category</dt><dd className="mt-0.5 text-foreground">{selected.issue_category}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Description</dt><dd className="mt-0.5 whitespace-pre-wrap text-foreground">{selected.description}</dd></div>
                  {selected.image_url ? (
                    <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Photo</dt><dd className="mt-1"><img src={mediaUrl(selected.image_url) ?? ""} alt="Damage evidence" className="max-h-56 rounded-md border border-border object-contain" /></dd></div>
                  ) : null}
                  {selected.resolution_notes ? <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Resolution notes</dt><dd className="mt-0.5 text-foreground">{selected.resolution_notes}</dd></div> : null}
                </dl>
              </div>

              {staff ? (
                <div className="rounded-md border border-border bg-card/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Staff review</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="damage-status">Status</Label>
                      <Select id="damage-status" value={updateStatus} onChange={(event) => setUpdateStatus(event.target.value)}>
                        {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="damage-update-priority">Priority</Label>
                      <Select id="damage-update-priority" value={updatePriority} onChange={(event) => setUpdatePriority(event.target.value)}>
                        {PRIORITIES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="damage-resolution">Resolution notes</Label>
                    <Textarea id="damage-resolution" rows={3} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Repair outcome, replacement parts, follow-up actions…" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setDetailOpen(false)}>Close</Button>
                    <Button size="sm" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
                      {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} Save review
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-foreground-muted">Updates from laboratory staff will appear here.</p>
                  <Button variant="secondary" size="sm" onClick={() => setDetailOpen(false)}>Close</Button>
                </div>
              )}

              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-foreground-muted">
                <span>Reviewed by: {selected.reviewed_by?.full_name ?? "Pending review"}</span>
                <Button variant="ghost" size="sm" asChild><Link to={`/equipment/${selected.equipment_id}`}>Open equipment record</Link></Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}