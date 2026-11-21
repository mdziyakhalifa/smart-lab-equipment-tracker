import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock3, PackageCheck, Search, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Borrowing, Page } from "@/types";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { BorrowingDialog } from "@/components/common/borrowing-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Filter = "all" | "return_requested" | "overdue";

export function ReturnsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Borrowing | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const returnsQuery = useQuery({
    queryKey: ["borrowings", "returns", filter, search],
    queryFn: () =>
      api.get<Page<Borrowing>>("/borrowings", {
        status: filter === "all" ? "active" : filter,
        search: search || undefined,
        page_size: 100,
      }),
  });

  const items = returnsQuery.data?.items ?? [];
  const awaiting = items.filter((item) => item.status === "return_requested").length;
  const issued = items.filter((item) => item.status === "issued").length;
  const overdue = items.filter((item) => item.is_overdue).length;

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All active loans" },
    { value: "return_requested", label: "Awaiting processing" },
    { value: "overdue", label: "Overdue" },
  ];

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Returns desk"
        title="Return processing"
        description="Receive returned equipment, record its condition and close active borrowing records."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Active loans" value={items.length} description="Issued, return requested or overdue" icon={PackageCheck} tone="blue" />
        <StatCard title="Awaiting processing" value={awaiting} description="Borrowers have requested a return" icon={Undo2} tone="amber" />
        <StatCard title="Overdue" value={overdue} description="Past the expected return date" icon={AlertTriangle} tone={overdue ? "danger" : "success"} />
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {filters.map((option) => (
              <Button key={option.value} size="sm" variant={filter === option.value ? "default" : "secondary"} onClick={() => setFilter(option.value)}>
                {option.label}
              </Button>
            ))}
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search borrower or equipment…" className="pl-9" />
          </div>
        </div>

        {returnsQuery.isLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : returnsQuery.isError ? (
          <div className="p-4"><ErrorState message={returnsQuery.error instanceof Error ? returnsQuery.error.message : undefined} onRetry={() => void returnsQuery.refetch()} /></div>
        ) : items.length === 0 ? (
          <EmptyState
            title={filter === "return_requested" ? "No returns awaiting processing" : filter === "overdue" ? "No overdue loans" : "No active loans"}
            description={filter === "return_requested" ? "Borrowers have not requested any returns yet." : "All active borrowing records are clear for this filter."}
            icon={filter === "overdue" ? AlertTriangle : Undo2}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>Borrower</TableHead>
                <TableHead className="min-w-[200px]">Equipment</TableHead>
                <TableHead className="hidden sm:table-cell">Qty</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28 text-right">Process</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((borrowing) => (
                <TableRow key={borrowing.id} className="cursor-pointer" onClick={() => { setSelected(borrowing); setDialogOpen(true); }}>
                  <TableCell className="font-mono text-[11px] font-medium text-foreground">{borrowing.transaction_code}</TableCell>
                  <TableCell>
                    <p className="text-[12.5px] font-medium text-foreground">{borrowing.user.full_name}</p>
                    <p className="text-[10.5px] text-foreground-muted">{borrowing.user.email}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-[12px] font-medium text-foreground">{borrowing.equipment.name}</p>
                    <p className="font-mono text-[10px] text-foreground-muted">{borrowing.equipment.asset_tag}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-[12.5px] text-foreground-muted">{borrowing.quantity}</TableCell>
                  <TableCell>
                    <span className={borrowing.is_overdue ? "font-medium text-danger" : "text-[12px] text-foreground-muted"}>
                      {formatDate(borrowing.expected_return_date)}
                    </span>
                    {borrowing.is_overdue ? <span className="ml-1.5 text-[10px] font-medium text-danger">({Math.abs(Math.ceil((new Date(borrowing.expected_return_date).getTime() - Date.now()) / 86400000))}d)</span> : null}
                  </TableCell>
                  <TableCell><StatusBadge status={borrowing.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); setSelected(borrowing); setDialogOpen(true); }}>
                      <Clock3 className="h-3.5 w-3.5" /> Return
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="mt-3 text-[11px] text-foreground-muted">Recording a return restores available inventory immediately and notifies the borrower.</p>

      <BorrowingDialog borrowing={selected} open={dialogOpen} onOpenChange={setDialogOpen} onUpdated={(updated) => setSelected(updated)} />
    </div>
  );
}