import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  ClipboardList,
  Download,
  Gauge,
  HandHelping,
  MapPin,
  Pencil,
  QrCode,
  ShoppingCart,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { api, mediaUrl } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Borrowing, CalibrationRecord, Equipment, MaintenanceRecord, Page } from "@/types";
import { formatCurrency, formatDate, humanize, percent } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { EquipmentThumb } from "@/components/common/equipment-thumb";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/common/states";
import { QrDialog } from "@/components/common/qr-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function DetailItem({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">{label}</dt>
      <dd className={`mt-0.5 text-[13px] text-foreground ${mono ? "font-mono text-[12px]" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

export function EquipmentDetailPage() {
  const { id } = useParams();
  const equipmentId = Number(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [qr, setQr] = useState<{ path: string; title: string; subtitle?: string; filename: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const staff = user?.role === "admin" || user?.role === "lab_assistant";
  const isAdmin = user?.role === "admin";
  const borrower = user?.role === "student" || user?.role === "faculty";

  const equipmentQuery = useQuery({
    queryKey: ["equipment", "detail", equipmentId],
    queryFn: () => api.get<Equipment>(`/equipment/${equipmentId}`),
    enabled: Number.isFinite(equipmentId),
  });

  const borrowingsQuery = useQuery({
    queryKey: ["borrowings", "equipment", equipmentId],
    queryFn: () => api.get<Page<Borrowing>>("/borrowings", { equipment_id: equipmentId, page_size: 8 }),
    enabled: Number.isFinite(equipmentId),
  });

  const maintenanceQuery = useQuery({
    queryKey: ["maintenance", "equipment", equipmentId],
    queryFn: () => api.get<Page<MaintenanceRecord>>("/maintenance", { equipment_id: equipmentId, page_size: 8 }),
    enabled: Number.isFinite(equipmentId),
  });

  const calibrationsQuery = useQuery({
    queryKey: ["calibrations", "equipment", equipmentId],
    queryFn: () => api.get<Page<CalibrationRecord>>("/calibrations", { equipment_id: equipmentId, page_size: 8 }),
    enabled: Number.isFinite(equipmentId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<{ message: string }>(`/equipment/${equipmentId}`),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
      navigate("/equipment", { replace: true });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to remove equipment."),
  });

  if (equipmentQuery.isLoading) return <div className="page-container"><PageSkeleton /></div>;
  if (equipmentQuery.isError || !equipmentQuery.data) {
    return (
      <div className="page-container">
        <ErrorState title="Equipment record unavailable" message={equipmentQuery.error instanceof Error ? equipmentQuery.error.message : "The requested equipment could not be found."} onRetry={() => void equipmentQuery.refetch()} />
      </div>
    );
  }

  const equipment = equipmentQuery.data;
  const image = mediaUrl(equipment.image_url);
  const availablePercent = percent(equipment.available_quantity, equipment.quantity);

  return (
    <div className="page-container">
      <PageHeader
        backTo="/equipment"
        eyebrow="Equipment record"
        title={equipment.name}
        description={`${equipment.asset_tag} · ${equipment.category?.name ?? "Uncategorized"} · ${equipment.laboratory?.name ?? "No laboratory"}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setQr({ path: `/equipment/${equipment.id}/qr`, title: equipment.name, subtitle: equipment.asset_tag, filename: `${equipment.asset_tag}-qr.png` })}>
              <QrCode className="h-4 w-4" /> QR label
            </Button>
            {borrower ? (
              <Button onClick={() => navigate(`/borrow?equipment=${equipment.id}`)}><HandHelping className="h-4 w-4" /> Borrow</Button>
            ) : null}
            {staff ? <Button variant="secondary" onClick={() => navigate(`/equipment/${equipment.id}/edit`)}><Pencil className="h-4 w-4" /> Edit</Button> : null}
            {isAdmin ? (
              <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)} aria-label="Remove equipment">
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="flex flex-col gap-4 p-5 sm:flex-row">
              {image ? (
                <img src={image} alt={equipment.name} className="h-32 w-full rounded-md border border-border object-cover sm:w-44" />
              ) : (
                <div className="flex h-32 w-full items-center justify-center rounded-md border border-border bg-card sm:w-44">
                  <EquipmentThumb category={equipment.category?.name} className="h-16 w-16" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={equipment.status} />
                  <StatusBadge status={equipment.condition} />
                  {equipment.calibration_required ? <Badge variant="outline">Calibration tracked</Badge> : null}
                  {!equipment.is_active ? <Badge variant="muted">Inactive</Badge> : null}
                </div>
                <p className="mt-3 text-[13px] leading-6 text-foreground-muted">{equipment.description || "No description has been recorded for this equipment."}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11.5px] text-foreground-muted">
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {equipment.laboratory?.name ?? "No laboratory"}{equipment.laboratory?.room ? ` · Room ${equipment.laboratory.room}` : ""}</span>
                  <span className="flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5" /> {equipment.quantity} registered units</span>
                  <span className="flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" /> {humanize(equipment.maintenance_status)}</span>
                </div>
              </div>
            </div>
            <Separator />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-4">
              <DetailItem label="Asset tag" value={equipment.asset_tag} mono />
              <DetailItem label="Manufacturer" value={equipment.manufacturer} />
              <DetailItem label="Model" value={equipment.model_number} />
              <DetailItem label="Serial number" value={equipment.serial_number} mono />
              <DetailItem label="Category" value={equipment.category?.name} />
              <DetailItem label="Laboratory" value={equipment.laboratory?.name} />
              <DetailItem label="Purchase date" value={formatDate(equipment.purchase_date)} />
              <DetailItem label="Purchase price" value={formatCurrency(equipment.purchase_price)} />
            </dl>
          </Card>

          <Card>
            <Tabs defaultValue="assets">
              <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <TabsList>
                  <TabsTrigger value="assets">Asset register</TabsTrigger>
                  <TabsTrigger value="borrowings">Borrowing history</TabsTrigger>
                  <TabsTrigger value="service">Maintenance & calibration</TabsTrigger>
                </TabsList>
                <p className="text-[11px] text-foreground-muted">{equipment.assets?.length ?? 0} physical assets</p>
              </div>
              <TabsContent value="assets" className="mt-0">
                {!equipment.assets || equipment.assets.length === 0 ? (
                  <EmptyState compact title="No assets registered" description="Physical assets are generated automatically from the equipment quantity." icon={Boxes} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Asset code</TableHead>
                        <TableHead className="hidden sm:table-cell">Serial number</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-12 text-right">QR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {equipment.assets.map((asset) => (
                        <TableRow key={asset.id}>
                          <TableCell className="font-mono text-[11.5px] font-medium text-foreground">{asset.asset_code}</TableCell>
                          <TableCell className="hidden sm:table-cell font-mono text-[11px] text-foreground-muted">{asset.serial_number ?? "—"}</TableCell>
                          <TableCell><StatusBadge status={asset.condition} /></TableCell>
                          <TableCell><StatusBadge status={asset.status} /></TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`QR for ${asset.asset_code}`}
                              onClick={() => setQr({ path: `/equipment/${equipment.id}/assets/${asset.id}/qr`, title: asset.asset_code, subtitle: `${equipment.name} · ${asset.serial_number ?? "No serial"}`, filename: `${asset.asset_code}-qr.png` })}
                            >
                              <QrCode className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
              <TabsContent value="borrowings" className="mt-0">
                {borrowingsQuery.isLoading ? <div className="p-5 text-[11px] text-foreground-muted">Loading borrowing history…</div> : (borrowingsQuery.data?.items.length ?? 0) === 0 ? (
                  <EmptyState compact title="No borrowing history" description="This equipment has not been borrowed yet." icon={ClipboardList} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transaction</TableHead>
                        <TableHead>Borrower</TableHead>
                        <TableHead className="hidden sm:table-cell">Due date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {borrowingsQuery.data?.items.map((borrowing) => (
                        <TableRow key={borrowing.id}>
                          <TableCell className="font-mono text-[11px] text-foreground">{borrowing.transaction_code}</TableCell>
                          <TableCell className="text-[12.5px]">{borrowing.user.full_name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-[12px] text-foreground-muted">{formatDate(borrowing.expected_return_date)}</TableCell>
                          <TableCell><StatusBadge status={borrowing.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
              <TabsContent value="service" className="mt-0">
                <div className="grid gap-0 md:grid-cols-2 md:divide-x md:divide-border">
                  <div>
                    <p className="border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Maintenance records</p>
                    {(maintenanceQuery.data?.items.length ?? 0) === 0 ? (
                      <EmptyState compact title="No maintenance records" description="No service history has been recorded." icon={Wrench} />
                    ) : (
                      <div className="divide-y divide-border">
                        {maintenanceQuery.data?.items.map((record) => (
                          <div key={record.id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[12.5px] font-medium text-foreground">{record.title}</p>
                              <StatusBadge status={record.status} />
                            </div>
                            <p className="mt-0.5 text-[10.5px] text-foreground-muted">{record.maintenance_code} · {formatDate(record.scheduled_date)} · {humanize(record.maintenance_type)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Calibration records</p>
                    {(calibrationsQuery.data?.items.length ?? 0) === 0 ? (
                      <EmptyState compact title="No calibration records" description="No calibration history has been recorded." icon={Gauge} />
                    ) : (
                      <div className="divide-y divide-border">
                        {calibrationsQuery.data?.items.map((record) => (
                          <div key={record.id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[12.5px] font-medium text-foreground">{record.calibration_code}</p>
                              <StatusBadge status={record.result} />
                            </div>
                            <p className="mt-0.5 text-[10.5px] text-foreground-muted">Performed {formatDate(record.calibration_date)} · Next due {formatDate(record.next_due_date)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Availability</CardTitle>
              <CardDescription>Current unit-level availability</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-semibold tracking-tight text-foreground">{equipment.available_quantity}</p>
                  <p className="text-[11px] text-foreground-muted">of {equipment.quantity} units available</p>
                </div>
                <span className="text-sm font-medium text-foreground-muted">{availablePercent}%</span>
              </div>
              <Progress value={availablePercent} className="mt-3 h-2" indicatorClassName={availablePercent === 0 ? "bg-danger" : availablePercent < 100 ? "bg-warning" : "bg-success"} />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" asChild><Link to="/availability"><Gauge className="h-3.5 w-3.5" /> Check dates</Link></Button>
                {borrower ? <Button size="sm" asChild><Link to={`/borrow?equipment=${equipment.id}`}><HandHelping className="h-3.5 w-3.5" /> Request</Link></Button> : null}
              </div>
              <p className="mt-3 text-[10.5px] leading-4 text-foreground-muted">Availability reflects assets currently borrowed, reserved for an active slot, under maintenance, or marked damaged.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Calibration</CardTitle>
              <CardDescription>Service compliance for this instrument</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-foreground-muted">Last calibrated</span>
                <span className="font-medium text-foreground">{formatDate(equipment.last_calibration_date)}</span>
              </div>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-foreground-muted">Next calibration</span>
                <span className="font-medium text-foreground">{formatDate(equipment.next_calibration_date)}</span>
              </div>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-foreground-muted">Required</span>
                <Badge variant={equipment.calibration_required ? "secondary" : "muted"}>{equipment.calibration_required ? "Yes" : "No"}</Badge>
              </div>
              <Separator />
              <div className="flex items-start gap-2 text-[11px] text-foreground-muted">
                <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground-muted" />
                <p>Calibration records are retained as part of the equipment service history and audit trail.</p>
              </div>
              {staff ? <Button variant="secondary" size="sm" className="w-full" asChild><Link to={`/calibration?equipment=${equipment.id}`}><Gauge className="h-3.5 w-3.5" /> Record calibration</Link></Button> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Report an issue</CardTitle>
              <CardDescription>Help keep the inventory safe and reliable</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-[12px] leading-5 text-foreground-muted">Found a fault, missing accessory, or damage? Submit a report so laboratory staff can review and repair the equipment.</p>
              <Button variant="secondary" size="sm" className="mt-3 w-full" asChild>
                <Link to={`/damage-reports?equipment=${equipment.id}`}><AlertTriangle className="h-3.5 w-3.5" /> New damage report</Link>
              </Button>
            </CardContent>
          </Card>

          <CardContent className="flex items-center gap-3 p-4">
            <ShoppingCart className="h-4 w-4 text-foreground-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-foreground-muted">Record created</p>
              <p className="text-[12px] font-medium text-foreground">{formatDate(equipment.created_at)}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setQr({ path: `/equipment/${equipment.id}/qr`, title: equipment.name, subtitle: equipment.asset_tag, filename: `${equipment.asset_tag}-qr.png` })} aria-label="Open QR label">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </div>
      </div>

      <QrDialog
        open={Boolean(qr)}
        onOpenChange={(open) => !open && setQr(null)}
        title={qr?.title ?? "QR label"}
        subtitle={qr?.subtitle}
        path={qr?.path ?? null}
        filename={qr?.filename ?? "qr.png"}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remove equipment from inventory?"
        description={`${equipment.name} will be marked inactive. This is only possible when there are no active borrowings or reservations.`}
        confirmLabel="Remove equipment"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}