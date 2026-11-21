import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, Filter, HandHelping, RotateCcw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Borrowing, Page } from "@/types";
import { formatDate, humanize } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { BorrowingDialog } from "@/components/common/borrowing-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending approval" },
  { value: "approved", label: "Approved" },
  { value: "issued", label: "Issued" },
  { value: "return_requested", label: "Return requested" },
  { value: "overdue", label: "Overdue" },
  { value: "returned", label: "Returned" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export function BorrowingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [selected, setSelected] = useState<Borrowing | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 350);
  const staff = user?.role === "admin" || user?.role === "lab_assistant";
  const borrower = user?.role === "student" || user?.role === "faculty";

  const page = Number(searchParams.get("page") ?? "1");
  const status = searchParams.get("status") ?? "";
  const overdue = searchParams.get("overdue") === "true";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";

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

  const borrowingsQuery = useQuery({
    queryKey: ["borrowings", "list", { page, status, overdue, dateFrom, dateTo, search: searchParams.get("search") ?? "" }],
    queryFn: () =>
      api.get<Page<Borrowing>>("/borrowings", {
        page,
        page_size: 10,
        status: status || undefined,
        overdue: overdue || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        search: searchParams.get("search") ?? undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const filtersActive = Boolean(status || overdue || dateFrom || dateTo || searchParams.get("search"));

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Borrowing"
        title={staff ? "Borrowing records" : "My borrowing records"}
        description={staff ? "Review requests, issue equipment, process returns and monitor overdue loans." : "Track the status of your borrowing requests and active loans."}
        actions={borrower ? <Button asChild><Link to="/borrow"><HandHelping className="h-4 w-4" /> New request</Link></Button> : undefined}
      />

      {staff && status === "pending" ? (
        <div className="mb-4 rounded-md border border-warning bg-warning-faint p-3 py-2.5 text-[12px] text-foreground-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Requests below are awaiting review. Open a record to approve, reject, or issue equipment.</p>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transaction code, borrower or equipment…" className="pl-9" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
              <Select aria-label="Filter by status" value={status} onChange={(event) => setFilter("status", event.target.value)} className="xl:w-[175px]">
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
              <Input aria-label="Requested from date" type="date" value={dateFrom} onChange={(event) => setFilter("date_from", event.target.value)} className="xl:w-[150px]" />
              <Input aria-label="Requested to date" type="date" value={dateTo} onChange={(event) => setFilter("date_to", event.target.value)} className="xl:w-[150px]" />
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border-border px-3 text-[12px] text-foreground-muted shadow-sm">
                <input type="checkbox" checked={overdue} onChange={(event) => setFilter("overdue", event.target.checked ? "true" : "")} className="h-3.5 w-3.5 rounded border-border text-foreground" />
                Overdue only
              </label>
            </div>
          </div>
          {filtersActive ? (
            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-foreground-muted">
              <Filter className="h-3.5 w-3.5" /> Filters applied
              <button className="inline-flex items-center gap-1 font-medium text-secondary hover:underline" onClick={resetFilters}><RotateCcw className="h-3 w-3" /> Reset</button>
            </div>
          ) : null}
        </div>

        {borrowingsQuery.isLoading ? (
          <TableSkeleton rows={7} columns={6} />
        ) : borrowingsQuery.isError ? (
          <div className="p-4"><ErrorState message={borrowingsQuery.error instanceof Error ? borrowingsQuery.error.message : undefined} onRetry={() => void borrowingsQuery.refetch()} /></div>
        ) : (borrowingsQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="No borrowing records found"
            description={filtersActive ? "Try clearing the filters or searching for a different record." : "Borrowing requests will appear here once submitted."}
            icon={ClipboardList}
            action={filtersActive ? <Button variant="secondary" size="sm" onClick={resetFilters}><RotateCcw className="h-3.5 w-3.5" /> Clear filters</Button> : borrower ? <Button size="sm" asChild><Link to="/borrow">Request equipment</Link></Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction</TableHead>
                  {staff ? <TableHead className="hidden md:table-cell">Borrower</TableHead> : null}
                  <TableHead className="min-w-[200px]">Equipment</TableHead>
                  <TableHead className="hidden sm:table-cell">Qty</TableHead>
                  <TableHead className="hidden lg:table-cell">Requested</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {borrowingsQuery.data?.items.map((borrowing) => (
                  <TableRow key={borrowing.id} className="cursor-pointer" onClick={() => { setSelected(borrowing); setDialogOpen(true); }}>
                    <TableCell className="font-mono text-[11px] font-medium text-foreground">{borrowing.transaction_code}</TableCell>
                    {staff ? (
                      <TableCell className="hidden md:table-cell">
                        <p className="text-[12.5px] text-foreground">{borrowing.user.full_name}</p>
                        <p className="text-[10.5px] text-foreground-muted">{borrowing.user.email}</p>
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <p className="truncate text-[12.5px] font-medium text-foreground">{borrowing.equipment.name}</p>
                      <p className="font-mono text-[10px] text-foreground-muted">{borrowing.equipment.asset_tag}</p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-[12.5px] text-foreground-muted">{borrowing.quantity}</TableCell>
                    <TableCell className="hidden lg:table-cell text-[11.5px] text-foreground-muted">{formatDate(borrowing.request_date)}</TableCell>
                    <TableCell>
                      <span className={borrowing.is_overdue ? "font-medium text-danger" : "text-[12px] text-foreground-muted"}>
                        {formatDate(borrowing.expected_return_date)}
                      </span>
                      {borrowing.is_overdue ? <span className="ml-1.5 text-[10px] font-medium text-danger">Overdue</span> : null}
                    </TableCell>
                    <TableCell><StatusBadge status={borrowing.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); setSelected(borrowing); setDialogOpen(true); }}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {borrowingsQuery.data ? (
              <Pagination
                page={borrowingsQuery.data.page}
                pages={borrowingsQuery.data.pages}
                total={borrowingsQuery.data.total}
                pageSize={borrowingsQuery.data.page_size}
                onPageChange={(next) => setFilter("page", String(next))}
                itemLabel="borrowing records"
              />
            ) : null}
          </>
        )}
      </Card>

      <p className="mt-3 text-[11px] text-foreground-muted">
        {staff ? "Staff can approve, reject, issue and process returns directly from a record." : "Open a record to request a return or cancel a pending request."}
      </p>

      <BorrowingDialog borrowing={selected} open={dialogOpen} onOpenChange={setDialogOpen} onUpdated={(updated) => setSelected(updated)} />
    </div>
  );
}