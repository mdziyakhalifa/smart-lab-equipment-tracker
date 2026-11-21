import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CalendarRange, Download, File, FileText, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { api, downloadFile } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { ReportPreview } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";

const REPORTS = [
  { value: "inventory", label: "Equipment inventory" },
  { value: "borrowings", label: "Equipment borrowings" },
  { value: "overdue", label: "Overdue borrowings" },
  { value: "damage", label: "Damage reports" },
  { value: "maintenance", label: "Maintenance" },
  { value: "calibration", label: "Calibration" },
  { value: "consumables", label: "Consumable stock" },
  { value: "activity", label: "User activity" },
] as const;

type ReportType = (typeof REPORTS)[number]["value"];

const FILTER_PLACEHOLDERS: Record<ReportType, string> = {
  inventory: "Category, laboratory, status, name or asset tag",
  borrowings: "Status, borrower or equipment, request date range",
  overdue: "Overdue borrower or equipment",
  damage: "Status, equipment or reporter",
  maintenance: "Status, type or equipment",
  calibration: "Calibration status, equipment name or asset tag",
  consumables: "Consumable name or supplier",
  activity: "Action, entity type or user",
};

export function ReportsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reportType, setReportType] = useState<ReportType>(searchParams.get("report") as ReportType ?? "inventory");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("date_from") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("date_to") ?? "");
  const [format, setFormat] = useState<"json" | "csv" | "pdf">("json");
  const [previewOpen, setPreviewOpen] = useState<ReportPreview | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const staff = user?.role === "admin" || user?.role === "lab_assistant";

  const dateFilters = reportType === "borrowings" || reportType === "overdue" || reportType === "damage" || reportType === "maintenance" || reportType === "activity";

  const reportQuery = useQuery({
    queryKey: ["reports", reportType, { status, search, dateFrom, dateTo, format }],
    queryFn: () =>
      api.get<ReportPreview>(`/reports/${reportType}`, {
        format,
        category_id: undefined,
        laboratory_id: undefined,
        status: status || undefined,
        user_id: undefined,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    enabled: staff,
  });

  const downloadMutation = useMutation({
    mutationFn: ({ type, fmt }: { type: ReportType; fmt: "csv" | "pdf" }) =>
      downloadFile(`/reports/${type}`, `${type}_report.${fmt}`, {
        format: fmt,
        status: status || undefined,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    onSuccess: () => {
      toast.success("Report downloaded.");
      setPreviewOpen(null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to download the report."),
  });

  const preview = reportQuery.data;
  const rows = preview?.rows ?? [];
  const columns = preview?.columns ?? [];
  const total = preview?.total ?? 0;

  function rowValue(row: Record<string, string | number>, key: string) {
    const value = row[key];
    if (value === null || value === undefined) return "—";
    if (typeof value === "number") return String(value);
    return value.length > 60 ? `${value.slice(0, 60)}…` : value;
  }

  const allColumnsUsed = columns.length > 0;
  const visibleColumns = allColumnsUsed ? columns.slice(0, 8) : [];

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Reporting"
        title="Reports & Analytics"
        description="Generate and export operational reports for inventory, borrowings, damage, maintenance, calibration, consumables and activity."
        actions={
          <>
            <Button variant="secondary" onClick={() => setReportType("inventory")} disabled={reportType === "inventory"}>
              Inventory
            </Button>
            <Button variant="secondary" onClick={() => setReportType("borrowings")} disabled={reportType === "borrowings"}>
              Borrowings
            </Button>
            <Button variant="secondary" onClick={() => setReportType("damage")} disabled={reportType === "damage"}>
              Damage
            </Button>
            <Button variant="secondary" onClick={() => setReportType("activity")} disabled={reportType === "activity"}>
              Activity
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={reportType}
                onChange={(event) => { setReportType(event.target.value as ReportType); setStatus(""); setSearch(""); setDateFrom(""); setDateTo(""); }}
                className="w-72"
                aria-label="Report type"
              >
                {REPORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select
                value={format}
                onChange={(event) => setFormat(event.target.value as "json" | "csv" | "pdf")}
                className="w-48 mt-2 sm:mt-0 sm:w-44"
                aria-label="Output format"
              >
                <option value="json">JSON preview</option>
                <option value="csv">CSV export</option>
                <option value="pdf">PDF export</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-80">
                <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  placeholder="From date"
                  className="pl-9"
                />
              </div>
              <div className="relative w-full sm:w-80">
                <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  placeholder="To date"
                  className="pl-9"
                />
              </div>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={FILTER_PLACEHOLDERS[reportType]}
                  className="pl-9"
                />
              </div>
              <div className="flex items-end gap-2">
                <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-48" aria-label="Filter by status">
                  <option value="">All statuses</option>
                  {reportType === "inventory" && [
                    { value: "available", label: "Available" },
                    { value: "partial", label: "Partially available" },
                    { value: "unavailable", label: "Unavailable" },
                    { value: "under_maintenance", label: "Under maintenance" },
                    { value: "damaged", label: "Damaged" },
                    { value: "retired", label: "Retired" },
                  ].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  {reportType === "borrowings" && ["pending", "approved", "issued", "return_requested", "overdue", "returned", "rejected", "cancelled"].map((option) => <option key={option} value={option}>{option}</option>)}
                  {reportType === "overdue" && ["issued", "return_requested", "overdue"].map((option) => <option key={option} value={option}>{option}</option>)}
                  {reportType === "damage" && ["reported", "under_review", "approved", "under_repair", "resolved"].map((option) => <option key={option} value={option}>{option}</option>)}
                  {reportType === "maintenance" && ["scheduled", "in_progress", "completed", "cancelled"].map((option) => <option key={option} value={option}>{option}</option>)}
                  {reportType === "calibration" && ["passed", "adjusted", "failed"].map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
                <Button size="sm" onClick={() => setReportType(reportType)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Run
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="preview">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-0">
            {reportQuery.isLoading ? (
              <div className="p-8 text-center text-[11px] text-foreground-muted">Generating report…</div>
            ) : reportQuery.isError ? (
              <div className="p-4"><ErrorState message={reportQuery.error instanceof Error ? reportQuery.error.message : undefined} onRetry={() => void reportQuery.refetch()} /></div>
            ) : format === "csv" || format === "pdf" ? (
              <div className="flex items-center gap-4 rounded-md border border-border bg-card p-6">
                <Download className="h-4 w-4 text-foreground-muted" />
                <div>
                  <p className="text-[12px] font-medium text-foreground">{format.toUpperCase()} export ready</p>
                  <p className="text-[11px] text-foreground-muted">Run the report again after changing filters, then download.</p>
                </div>
                <Button onClick={() => downloadMutation.mutate({ type: reportType, fmt: format })}>
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
            ) : rows.length === 0 ? (
              <EmptyState title="No records found" description="Try adjusting the filters or date range." icon={FileText} />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                  <div>
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-foreground-muted">{preview?.title}</h3>
                    <p className="text-[11px] text-foreground-muted">{preview?.filters}</p>
                  </div>
                  <p className="text-[11px] font-medium text-foreground-muted">{total} record{total === 1 ? "" : "s"} · generated {preview?.generated_at}</p>
                </div>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map((column) => <TableHead key={column.key} className="text-[10px] text-foreground-muted">{column.label}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 50).map((row, index) => (
                        <TableRow key={index} className="hover:bg-card">
                          {columns.map((column) => (
                            <TableCell key={column.key} className="text-[11px]">
                              {rowValue(row, column.key)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {total > 50 && (
                  <p className="mt-2 text-[11px] text-foreground-muted">Showing first 50 of {total} records. Export CSV or PDF for the complete dataset.</p>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="export" className="mt-0 p-4">
            <div className="space-y-3 text-[12px] text-foreground-muted">
              <p>Choose a format to download the current report:</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => downloadMutation.mutate({ type: reportType, fmt: "csv" })}>
                  <File className="h-3.5 w-3.5" /> Download CSV
                </Button>
                <Button variant="secondary" size="sm" onClick={() => downloadMutation.mutate({ type: reportType, fmt: "pdf" })}>
                  <FileText className="h-3.5 w-3.5" /> Download PDF
                </Button>
              </div>
              <p className="text-[11px] text-foreground-muted">
                CSV exports contain the full dataset. PDF exports are limited to the first 300 records and are suitable for printing or sharing with auditors.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Clear report results?"
        description="This discards the current preview but does not affect any underlying records."
        confirmLabel="Clear results"
        loading={reportQuery.isFetching}
        onConfirm={() => setPreviewOpen(null)}
      />
    </div>
  );
}