import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Download,
  Filter,
  MoreHorizontal,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Category, Equipment, Laboratory, Page } from "@/types";
import { formatDate, humanize, percent } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { EquipmentThumb } from "@/components/common/equipment-thumb";
import { QrDialog } from "@/components/common/qr-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_OPTIONS = [
  "available", "partially_available", "borrowed", "reserved", "under_maintenance", "damaged", "retired",
];

export function EquipmentListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [qrTarget, setQrTarget] = useState<Equipment | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const staff = user?.role === "admin" || user?.role === "lab_assistant";

  const page = Number(searchParams.get("page") ?? "1");
  const categoryId = searchParams.get("category_id") ?? "";
  const laboratoryId = searchParams.get("laboratory_id") ?? "";
  const status = searchParams.get("status") ?? "";
  const availability = searchParams.get("availability") ?? "";
  const calibration = searchParams.get("calibration") ?? "";
  const sort = searchParams.get("sort") ?? "name";

  useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (debouncedSearch === current) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch.trim()) next.set("search", debouncedSearch.trim());
    else next.delete("search");
    next.delete("page");
    setSearchParams(next, { replace: true });
  }, [debouncedSearch, searchParams, setSearchParams]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next, { replace: true });
  }

  function resetFilters() {
    setSearch("");
    setSearchParams({}, { replace: true });
  }

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });
  const labsQuery = useQuery({ queryKey: ["labs"], queryFn: () => api.get<Laboratory[]>("/labs") });

  const equipmentQuery = useQuery({
    queryKey: ["equipment", "list", { page, categoryId, laboratoryId, status, availability, calibration, sort, search: searchParams.get("search") ?? "" }],
    queryFn: () =>
      api.get<Page<Equipment>>("/equipment", {
        page,
        page_size: 10,
        search: searchParams.get("search") ?? undefined,
        category_id: categoryId || undefined,
        laboratory_id: laboratoryId || undefined,
        status: status || undefined,
        availability: availability || undefined,
        calibration: calibration || undefined,
        sort,
      }),
    placeholderData: (previous) => previous,
  });

  const filtersActive = Boolean(categoryId || laboratoryId || status || availability || calibration || searchParams.get("search"));

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Inventory"
        title="Equipment catalogue"
        description="Search, filter and manage every laboratory instrument and its physical assets."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/availability")}><SlidersHorizontal className="h-4 w-4" /> Availability check</Button>
            {staff ? <Button onClick={() => navigate("/equipment/new")}><Plus className="h-4 w-4" /> Add equipment</Button> : null}
          </>
        }
      />

      <Card className="overflow-hidden border-border bg-card shadow-card">
        <div className="border-b border-border bg-warm-200/40 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, asset tag, manufacturer, model or serial number…"
                className="pl-9 bg-warm-100 text-xs h-8.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex xl:flex-wrap">
              <Select aria-label="Filter by category" value={categoryId} onChange={(event) => setFilter("category_id", event.target.value)} className="xl:w-[165px]">
                <option value="">All categories</option>
                {(categoriesQuery.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </Select>
              <Select aria-label="Filter by laboratory" value={laboratoryId} onChange={(event) => setFilter("laboratory_id", event.target.value)} className="xl:w-[165px]">
                <option value="">All laboratories</option>
                {(labsQuery.data ?? []).map((lab) => <option key={lab.id} value={lab.id}>{lab.name}</option>)}
              </Select>
              <Select aria-label="Filter by status" value={status} onChange={(event) => setFilter("status", event.target.value)} className="xl:w-[155px]">
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
              </Select>
              <Select aria-label="Filter by availability" value={availability} onChange={(event) => setFilter("availability", event.target.value)} className="xl:w-[150px]">
                <option value="">Any availability</option>
                <option value="available">Available</option>
                <option value="partial">Partially available</option>
                <option value="unavailable">Unavailable</option>
              </Select>
              <Select aria-label="Filter by calibration" value={calibration} onChange={(event) => setFilter("calibration", event.target.value)} className="xl:w-[150px]">
                <option value="">Any calibration</option>
                <option value="required">Calibration tracked</option>
                <option value="due_soon">Due within 7 days</option>
                <option value="overdue">Calibration overdue</option>
              </Select>
              <Select aria-label="Sort equipment" value={sort} onChange={(event) => setFilter("sort", event.target.value)} className="xl:w-[145px]">
                <option value="name">Name A–Z</option>
                <option value="-name">Name Z–A</option>
                <option value="asset_tag">Asset tag A–Z</option>
                <option value="-created_at">Newest first</option>
                <option value="available_quantity">Least available</option>
                <option value="next_calibration_date">Calibration due</option>
              </Select>
            </div>
          </div>
          {filtersActive ? (
            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Filter className="h-3.5 w-3.5" /> Filters applied
              <button className="inline-flex items-center gap-1 font-medium text-primary hover:underline cursor-pointer" onClick={resetFilters}>
                <RotateCcw className="h-3 w-3" /> Reset all
              </button>
            </div>
          ) : null}
        </div>

        {equipmentQuery.isLoading ? (
          <TableSkeleton rows={7} columns={6} />
        ) : equipmentQuery.isError ? (
          <div className="p-4">
            <ErrorState message={equipmentQuery.error instanceof Error ? equipmentQuery.error.message : undefined} onRetry={() => void equipmentQuery.refetch()} />
          </div>
        ) : equipmentQuery.data && equipmentQuery.data.items.length === 0 ? (
          <EmptyState
            title="No equipment matched your filters"
            description="Try a different search term, clear the filters, or register a new equipment record."
            icon={Boxes}
            action={filtersActive ? <Button variant="secondary" size="sm" onClick={resetFilters}><RotateCcw className="h-3.5 w-3.5" /> Clear filters</Button> : staff ? <Button size="sm" onClick={() => navigate("/equipment/new")}><Plus className="h-3.5 w-3.5" /> Add equipment</Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[260px]">Equipment</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="hidden lg:table-cell">Laboratory</TableHead>
                  <TableHead className="min-w-[160px]">Availability</TableHead>
                  <TableHead className="hidden sm:table-cell">Condition</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipmentQuery.data?.items.map((equipment) => (
                  <TableRow key={equipment.id} className="cursor-pointer" onClick={() => navigate(`/equipment/${equipment.id}`)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <EquipmentThumb category={equipment.category?.name} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-foreground">{equipment.name}</p>
                          <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{equipment.asset_tag}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-[12.5px] text-muted-foreground">{equipment.category?.name ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-[12.5px] text-foreground">{equipment.laboratory?.name ?? "—"}</p>
                      <p className="text-[10.5px] text-muted-foreground">{equipment.laboratory?.building ?? ""}{equipment.laboratory?.room ? ` · ${equipment.laboratory.room}` : ""}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-foreground">{equipment.available_quantity} of {equipment.quantity}</span>
                        <span className="text-muted-foreground">{percent(equipment.available_quantity, equipment.quantity)}%</span>
                      </div>
                      <Progress value={percent(equipment.available_quantity, equipment.quantity)} className="mt-1.5 h-1.5" indicatorClassName={equipment.available_quantity === 0 ? "bg-danger" : equipment.available_quantity < equipment.quantity ? "bg-warning" : "bg-success"} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell"><StatusBadge status={equipment.condition} /></TableCell>
                    <TableCell><StatusBadge status={equipment.status} /></TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${equipment.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Equipment actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => navigate(`/equipment/${equipment.id}`)}>View details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setQrTarget(equipment)}><QrCode /> View QR label</DropdownMenuItem>
                          {staff ? <DropdownMenuItem onClick={() => navigate(`/equipment/${equipment.id}/edit`)}>Edit record</DropdownMenuItem> : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => navigate(`/borrow?equipment=${equipment.id}`)}><Download /> Borrow equipment</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {equipmentQuery.data ? (
              <Pagination
                page={equipmentQuery.data.page}
                pages={equipmentQuery.data.pages}
                total={equipmentQuery.data.total}
                pageSize={equipmentQuery.data.page_size}
                onPageChange={(next) => setFilter("page", String(next))}
                itemLabel="equipment records"
              />
            ) : null}
          </>
        )}
      </Card>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-foreground-muted">
        <p>{equipmentQuery.data ? `${equipmentQuery.data.total} equipment records in the active inventory.` : "Loading inventory…"}</p>
        <p className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-green-600" /> Live inventory from the laboratory database</p>
      </div>

      <QrDialog
        open={Boolean(qrTarget)}
        onOpenChange={(open) => !open && setQrTarget(null)}
        title={qrTarget?.name ?? "Equipment QR"}
        subtitle={qrTarget ? `${qrTarget.asset_tag} · ${qrTarget.laboratory?.name ?? "No laboratory"}` : undefined}
        path={qrTarget ? `/equipment/${qrTarget.id}/qr` : null}
        filename={`${qrTarget?.asset_tag ?? "equipment"}-qr.png`}
      />
    </div>
  );
}
