import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardList,
  FlaskConical,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Consumable, ConsumableTransaction, Laboratory, Page } from "@/types";
import { formatCurrency, formatDateTime, humanize, percent } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { Pagination } from "@/components/common/pagination";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
  z.number({ invalid_type_error: "Enter a valid number." }).min(0, "Value cannot be negative.").optional(),
);

const consumableSchema = z.object({
  name: z.string().min(2, "Enter the consumable name.").max(160),
  category: z.string().min(2, "Enter a category.").max(80),
  description: z.string().max(2000).optional(),
  quantity: z.coerce.number().min(0, "Stock cannot be negative."),
  unit: z.string().min(1, "Enter a unit.").max(30),
  minimum_stock: z.coerce.number().min(0, "Minimum stock cannot be negative."),
  laboratory_id: z.preprocess((value) => (value === "" || value === null || value === undefined ? undefined : Number(value)), z.number().optional()),
  supplier: z.string().max(160).optional(),
  unit_price: optionalNumber,
});

type ConsumableFormValues = z.infer<typeof consumableSchema>;

const movementSchema = z
  .object({
    transaction_type: z.enum(["in", "out", "adjustment"]),
    quantity: z.coerce.number().min(0, "Quantity cannot be negative."),
    note: z.string().max(500).optional(),
  })
  .refine((values) => values.transaction_type === "adjustment" || values.quantity > 0, {
    message: "Quantity must be greater than zero.",
    path: ["quantity"],
  });

type MovementFormValues = z.infer<typeof movementSchema>;

export function ConsumablesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [category, setCategory] = useState("");
  const [laboratoryId, setLaboratoryId] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Consumable | null>(null);
  const [selected, setSelected] = useState<Consumable | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const staff = user?.role === "admin" || user?.role === "lab_assistant";
  const isAdmin = user?.role === "admin";

  const consumablesQuery = useQuery({
    queryKey: ["consumables", { search, lowStockOnly, category, laboratoryId, page }],
    queryFn: () =>
      api.get<Page<Consumable>>("/consumables", {
        search: search || undefined,
        low_stock: lowStockOnly || undefined,
        category: category || undefined,
        laboratory_id: laboratoryId || undefined,
        page,
        page_size: 10,
      }),
    placeholderData: (previous) => previous,
  });

  const labsQuery = useQuery({ queryKey: ["labs"], queryFn: () => api.get<Laboratory[]>("/labs") });

  const transactionsQuery = useQuery({
    queryKey: ["consumables", "transactions", selected?.id],
    queryFn: () => api.get<Page<ConsumableTransaction>>(`/consumables/${selected!.id}/transactions`, { page_size: 50 }),
    enabled: Boolean(selected) && detailOpen,
  });

  const categories = useMemo(() => {
    const values = new Set((consumablesQuery.data?.items ?? []).map((item) => item.category));
    return Array.from(values).sort();
  }, [consumablesQuery.data]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ConsumableFormValues>({
    resolver: zodResolver(consumableSchema),
    defaultValues: {
      name: "",
      category: "",
      description: "",
      quantity: 0,
      unit: "units",
      minimum_stock: 0,
      laboratory_id: undefined,
      supplier: "",
      unit_price: undefined,
    },
  });

  const movementForm = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { transaction_type: "out", quantity: 1, note: "" },
  });

  useEffect(() => {
    if (!editing) return;
    reset({
      name: editing.name,
      category: editing.category,
      description: editing.description ?? "",
      quantity: editing.quantity,
      unit: editing.unit,
      minimum_stock: editing.minimum_stock,
      laboratory_id: editing.laboratory_id ?? undefined,
      supplier: editing.supplier ?? "",
      unit_price: editing.unit_price ?? undefined,
    });
  }, [editing, reset]);

  useEffect(() => {
    if (!detailOpen) {
      setSelected(null);
      movementForm.reset({ transaction_type: "out", quantity: 1, note: "" });
    }
  }, [detailOpen, movementForm]);

  const saveMutation = useMutation({
    mutationFn: (values: ConsumableFormValues) => {
      const payload = {
        ...values,
        description: values.description || null,
        laboratory_id: values.laboratory_id ?? null,
        supplier: values.supplier || null,
        unit_price: values.unit_price ?? null,
      };
      return editing
        ? api.put<Consumable>(`/consumables/${editing.id}`, payload)
        : api.post<Consumable>("/consumables", payload);
    },
    onSuccess: (item) => {
      toast.success(editing ? "Consumable updated." : "Consumable added to stock.");
      setFormOpen(false);
      setEditing(null);
      reset({ name: "", category: "", description: "", quantity: 0, unit: "units", minimum_stock: 0, laboratory_id: undefined, supplier: "", unit_price: undefined });
      void queryClient.invalidateQueries({ queryKey: ["consumables"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (selected?.id === item.id) setSelected(item);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to save the consumable."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<{ message: string }>(`/consumables/${selected!.id}`),
    onSuccess: (result) => {
      toast.success(result.message);
      setDeleteOpen(false);
      setDetailOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["consumables"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to remove the consumable."),
  });

  const movementMutation = useMutation({
    mutationFn: (values: MovementFormValues) =>
      api.post<ConsumableTransaction>(`/consumables/${selected!.id}/transactions`, {
        transaction_type: values.transaction_type,
        quantity: values.quantity,
        note: values.note || null,
      }),
    onSuccess: (transaction) => {
      toast.success(`Stock movement recorded. New balance: ${transaction.balance_after} ${selected?.unit ?? "units"}.`);
      setSelected((current) => (current ? { ...current, quantity: transaction.balance_after, is_low_stock: transaction.balance_after <= current.minimum_stock } : current));
      movementForm.reset({ transaction_type: "out", quantity: 1, note: "" });
      void queryClient.invalidateQueries({ queryKey: ["consumables"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to record the stock movement."),
  });

  const items = consumablesQuery.data?.items ?? [];
  const lowStock = items.filter((item) => item.is_low_stock).length;
  const totalValue = items.reduce((sum, item) => sum + (item.unit_price ?? 0) * item.quantity, 0);
  const filtered = Boolean(search || lowStockOnly || category || laboratoryId);

  function openCreate() {
    setEditing(null);
    reset({ name: "", category: "", description: "", quantity: 0, unit: "units", minimum_stock: 0, laboratory_id: undefined, supplier: "", unit_price: undefined });
    setFormOpen(true);
  }

  function openEdit(item: Consumable) {
    setEditing(item);
    setFormOpen(true);
  }

  function openDetail(item: Consumable) {
    setSelected(item);
    setDetailOpen(true);
  }

  function resetFilters() {
    setSearch("");
    setLowStockOnly(false);
    setCategory("");
    setLaboratoryId("");
    setPage(1);
  }

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Inventory"
        title="Consumables"
        description="Monitor laboratory consumable stock levels, record usage and receive low-stock alerts before supplies run out."
        actions={staff ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add consumable</Button> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Stock items" value={consumablesQuery.data?.total ?? 0} description="Active consumables across laboratories" icon={Package} tone="navy" />
        <StatCard title="Low stock" value={lowStock} description="At or below the minimum threshold" icon={AlertTriangle} tone="warning" />
        <StatCard title="Stock value" value={formatCurrency(totalValue)} description="Estimated value of the current page" icon={FlaskConical} tone="primary" />
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 flex-1 xl:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
              <Input
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Search consumable or supplier…"
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="sm:w-40" aria-label="Filter by category">
                <option value="">All categories</option>
                {categories.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
              <Select value={laboratoryId} onChange={(event) => { setLaboratoryId(event.target.value); setPage(1); }} className="sm:w-44" aria-label="Filter by laboratory">
                <option value="">All laboratories</option>
                {(labsQuery.data ?? []).map((lab) => <option key={lab.id} value={lab.id}>{lab.name}</option>)}
              </Select>
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-[12px] text-foreground-muted shadow-sm">
                <input type="checkbox" checked={lowStockOnly} onChange={(event) => { setLowStockOnly(event.target.checked); setPage(1); }} className="h-3.5 w-3.5 rounded border-border text-foreground" />
                Low stock only
              </label>
            </div>
          </div>
          {filtered ? (
            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-foreground-muted">
              Filters applied
              <button className="font-medium text-secondary hover:underline" onClick={resetFilters}>Reset filters</button>
            </div>
          ) : null}
        </div>

        {consumablesQuery.isLoading ? (
          <TableSkeleton rows={7} columns={6} />
        ) : consumablesQuery.isError ? (
          <div className="p-4"><ErrorState message={consumablesQuery.error instanceof Error ? consumablesQuery.error.message : undefined} onRetry={() => void consumablesQuery.refetch()} /></div>
        ) : items.length === 0 ? (
          <EmptyState
            title={filtered ? "No consumables match these filters" : "No consumables recorded"}
            description={filtered ? "Try clearing filters or searching for a different item." : staff ? "Add laboratory consumables to begin tracking stock levels." : "Consumable stock will appear here once laboratory staff add it."}
            icon={Package}
            action={filtered ? <Button variant="secondary" size="sm" onClick={resetFilters}>Clear filters</Button> : staff ? <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> Add consumable</Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consumable</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="hidden lg:table-cell">Laboratory</TableHead>
                  <TableHead>Stock level</TableHead>
                  <TableHead className="hidden sm:table-cell">Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => openDetail(item)}>
                    <TableCell>
                      <p className="text-[12px] font-medium text-foreground">{item.name}</p>
                      <p className="text-[10.5px] text-foreground-muted">{formatCurrency(item.unit_price)} / {item.unit}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-[11.5px] text-foreground-muted">{item.category}</TableCell>
                    <TableCell className="hidden lg:table-cell text-[11.5px] text-foreground-muted">{item.laboratory?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="w-32">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold">{item.quantity} {item.unit}</span>
                          <span className="text-foreground-muted">min {item.minimum_stock}</span>
                        </div>
                        <Progress
                          value={percent(item.quantity, Math.max(item.minimum_stock * 2, item.quantity, 1))}
                          className="mt-1 h-1.5"
                          indicatorClassName="secondary"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-[11.5px] text-foreground-muted">{item.supplier ?? "—"}</TableCell>
                    <TableCell>
                      {item.is_low_stock ? <Badge variant="danger">Low stock</Badge> : <Badge variant="success">In stock</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); openDetail(item); }}>
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {consumablesQuery.data ? (
              <Pagination
                page={consumablesQuery.data.page}
                pages={consumablesQuery.data.pages}
                total={consumablesQuery.data.total}
                pageSize={consumablesQuery.data.page_size}
                onPageChange={setPage}
                itemLabel="consumables"
              />
            ) : null}
          </>
        )}
      </Card>

      <p className="mt-3 text-[11px] text-foreground-muted">
        Staff record stock-in, stock-out and adjustments. Low-stock notifications are generated automatically when balances reach the minimum threshold.
      </p>

      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit consumable" : "Add consumable"}</DialogTitle>
            <DialogDescription>{editing ? "Update stock details and thresholds." : "Create a stock item and record its opening balance."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((values) => saveMutation.mutate(values))} className="space-y-4" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="consumable-name">Name *</Label>
                <Input id="consumable-name" placeholder="e.g. Nitrile examination gloves" {...register("name")} />
                {errors.name ? <p className="text-[10px] text-foreground-danger">{errors.name.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consumable-category">Category *</Label>
                <Input id="consumable-category" placeholder="e.g. Safety supplies" {...register("category")} />
                {errors.category ? <p className="text-[10px] text-foreground-danger">{errors.category.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consumable-lab">Laboratory</Label>
                <Select id="consumable-lab" {...register("laboratory_id")}>
                  <option value="">Unassigned</option>
                  {(labsQuery.data ?? []).map((lab) => <option key={lab.id} value={lab.id}>{lab.name}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consumable-quantity">Stock quantity *</Label>
                <Input id="consumable-quantity" type="number" min="0" step="0.1" disabled={Boolean(editing)} {...register("quantity")} />
                <p className="text-[10px] text-foreground-muted">{editing ? "Use stock movements to change the balance." : "Opening stock balance."}</p>
                {errors.quantity ? <p className="text-[10px] text-foreground-danger">{errors.quantity.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consumable-unit">Unit *</Label>
                <Input id="consumable-unit" placeholder="boxes, bottles, packs…" {...register("unit")} />
                {errors.unit ? <p className="text-[10px] text-foreground-danger">{errors.unit.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consumable-minimum">Minimum stock *</Label>
                <Input id="consumable-minimum" type="number" min="0" step="0.1" {...register("minimum_stock")} />
                {errors.minimum_stock ? <p className="text-[10px] text-foreground-danger">{errors.minimum_stock.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consumable-price">Unit price (USD)</Label>
                <Input id="consumable-price" type="number" min="0" step="0.01" {...register("unit_price")} />
                {errors.unit_price ? <p className="text-[10px] text-foreground-danger">{errors.unit_price.message}</p> : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="consumable-supplier">Supplier</Label>
                <Input id="consumable-supplier" placeholder="Preferred supplier" {...register("supplier")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="consumable-description">Description</Label>
                <Textarea id="consumable-description" rows={2} placeholder="Specification, storage requirements, usage notes…" {...register("description")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
                {isSubmitting || saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                {editing ? "Save changes" : "Add consumable"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          {selected ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle>{selected.name}</DialogTitle>
                  {selected.is_low_stock ? <Badge variant="danger">Low stock</Badge> : <Badge variant="success">In stock</Badge>}
                </div>
                <DialogDescription>{selected.category} · {selected.laboratory?.name ?? "Unassigned laboratory"}</DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Current stock</p>
                  <p className="mt-0.5 text-xl font-semibold text-foreground">{selected.quantity} <span className="text-[11px] font-normal text-foreground-muted">{selected.unit}</span></p>
                </div>
                <div className="rounded-md border border-border px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Minimum stock</p>
                  <p className="mt-0.5 text-xl font-semibold text-foreground">{selected.minimum_stock} <span className="text-[11px] font-normal text-foreground-muted">{selected.unit}</span></p>
                </div>
                <div className="rounded-md border border-border px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Unit price</p>
                  <p className="mt-0.5 text-xl font-semibold text-foreground">{formatCurrency(selected.unit_price)}</p>
                </div>
              </div>

              {selected.is_low_stock ? (
                <div className="rounded-md border border-border p-3">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <p className="text-[12px] text-foreground-warning">Stock is at or below the minimum threshold. Record a stock-in movement or notify the supplier.</p>
                </div>
              ) : null}

              <Tabs defaultValue="movement">
                <TabsList>
                  <TabsTrigger value="movement">Stock movement</TabsTrigger>
                  <TabsTrigger value="history">Movement history</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                </TabsList>
                <TabsContent value="movement" className="mt-3">
                  {staff ? (
                    <form onSubmit={movementForm.handleSubmit((values) => movementMutation.mutate(values))} className="rounded-md border border-border p-3" noValidate>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="movement-type">Movement *</Label>
                          <Select id="movement-type" {...movementForm.register("transaction_type")}>
                            <option value="in">Stock in</option>
                            <option value="out">Stock out</option>
                            <option value="adjustment">Set exact balance</option>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="movement-quantity">Quantity *</Label>
                          <Input id="movement-quantity" type="number" min="0" step="0.1" {...movementForm.register("quantity")} />
                          {movementForm.formState.errors.quantity ? <p className="text-[10px] text-foreground-danger">{movementForm.formState.errors.quantity.message}</p> : null}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="movement-note">Reference</Label>
                          <Input id="movement-note" placeholder="Usage, order number…" {...movementForm.register("note")} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-foreground-muted">
                          {movementForm.watch("transaction_type") === "adjustment"
                            ? "The exact balance will be set to the quantity entered."
                            : "The quantity will be added to or deducted from the current balance."}
                        </p>
                        <Button type="submit" size="sm" disabled={movementMutation.isPending}>
                          {movementMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : movementForm.watch("transaction_type") === "in" ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                          Record movement
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <p className="rounded-md border border-border px-3 py-4 text-center text-[12px] text-foreground-muted">Only laboratory staff can record stock movements.</p>
                  )}
                </TabsContent>
                <TabsContent value="history" className="mt-3">
                  {transactionsQuery.isLoading ? (
                    <p className="py-6 text-center text-[11px] text-foreground-muted">Loading stock movements…</p>
                  ) : transactionsQuery.isError ? (
                    <ErrorState message={transactionsQuery.error instanceof Error ? transactionsQuery.error.message : undefined} onRetry={() => void transactionsQuery.refetch()} />
                  ) : (transactionsQuery.data?.items.length ?? 0) === 0 ? (
                    <EmptyState compact title="No stock movements" description="Stock-in, stock-out and adjustment entries will appear here." icon={ClipboardList} />
                  ) : (
                    <div className="max-h-64 border-border overflow-y-auto rounded-md">
                      {transactionsQuery.data?.items.map((transaction) => (
                        <div key={transaction.id} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                            {transaction.transaction_type === "in" ? (
                              <span className="text-success"><ArrowDownToLine className="h-3.5 w-3.5" /></span>
                            ) : transaction.transaction_type === "out" ? (
                              <span className="text-primary"><ArrowUpFromLine className="h-3.5 w-3.5" /></span>
                            ) : (
                              <span className="text-foreground-muted"><Settings2 className="h-3.5 w-3.5" /></span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-foreground">{humanize(transaction.transaction_type)} · {transaction.quantity} {selected.unit}</p>
                            <p className="truncate text-[10.5px] text-foreground-muted">{transaction.user?.full_name ?? "—"} · {formatDateTime(transaction.created_at)}{transaction.note ? ` · ${transaction.note}` : ""}</p>
                          </div>
                          <span className="text-[11px] font-medium text-foreground-muted">Balance {transaction.balance_after}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="details" className="mt-3">
                  <dl className="grid gap-x-5 gap-y-3 rounded-md border border-border p-4 text-[12.5px] sm:grid-cols-2">
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Supplier</dt><dd className="mt-0.5 text-foreground">{selected.supplier ?? "—"}</dd></div>
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Laboratory</dt><dd className="mt-0.5 text-foreground">{selected.laboratory?.name ?? "Unassigned"}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Description</dt><dd className="mt-0.5 text-foreground">{selected.description || "No description provided."}</dd></div>
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Created</dt><dd className="mt-0.5 text-foreground">{formatDateTime(selected.created_at)}</dd></div>
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Last updated</dt><dd className="mt-0.5 text-foreground">{formatDateTime(selected.updated_at)}</dd></div>
                  </dl>
                </TabsContent>
              </Tabs>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <div className="flex gap-2">
                  {staff ? <Button variant="secondary" size="sm" onClick={() => { setDetailOpen(false); openEdit(selected); }}><Pencil className="h-3.5 w-3.5" /> Edit item</Button> : null}
                  {isAdmin ? <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}><Trash2 className="h-3.5 w-3.5" /> Remove</Button> : null}
                </div>
                <Button variant="secondary" size="sm" onClick={() => setDetailOpen(false)}>Close</Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remove consumable from stock?"
        description={`${selected?.name ?? "This consumable"} will be removed from active stock. Historical movement records are retained.`}
        confirmLabel="Remove consumable"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}