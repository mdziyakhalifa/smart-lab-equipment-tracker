import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Gauge,
  HandHelping,
  Layers,
  Package,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { DashboardSummary } from "@/types";
import { formatDate, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/common/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_COLORS: Record<string, string> = {
  available: "#557C61",
  partially_available: "#B77B38",
  borrowed: "#426783",
  reserved: "#7891A4",
  under_maintenance: "#B77B38",
  damaged: "#AD5650",
  retired: "#716D65",
};

const CATEGORY_COLORS = ["#172D46", "#426783", "#557C61", "#B77B38", "#7891A4", "#557D9C"];

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("borrowings");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", user?.role],
    queryFn: () => api.get<DashboardSummary>("/dashboard/summary"),
    enabled: Boolean(user),
  });

  if (isLoading) {
    return (
      <div className="page-container py-6">
        <PageSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page-container py-8">
        <ErrorState
          title="Failed to load dashboard metrics"
          message="Could not retrieve real-time data from the laboratory system."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const {
    role,
    stats,
    charts,
    recent_borrowings,
    return_queue,
    damage_reports,
    upcoming_maintenance,
    calibration_due,
    recent_activity,
  } = data;

  const isStaff = role === "admin" || role === "lab_assistant";
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="page-container space-y-7 pb-12">
      {/* 1. Header with greeting, date, and quick actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {currentDate}
            </span>
            <span className="text-xs text-muted-foreground">• Operational System Live</span>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Welcome back, {user?.full_name?.split(" ")[0] || "User"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isStaff
              ? "Central equipment registry, inventory capacity, scheduling, and compliance overview."
              : "Access equipment inventory, request loans, and track your active laboratory reservations."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isStaff ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/equipment/new")}
                className="h-8.5 text-xs font-semibold"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5 text-primary" /> Add Equipment
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/returns")}
                className="h-8.5 text-xs font-semibold"
              >
                <HandHelping className="mr-1.5 h-3.5 w-3.5 text-secondary" /> Process Return
              </Button>
              <Button
                size="sm"
                onClick={() => navigate("/reports")}
                className="h-8.5 text-xs font-semibold"
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" /> View Reports
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/borrow")}
                className="h-8.5 text-xs font-semibold"
              >
                <HandHelping className="mr-1.5 h-3.5 w-3.5 text-primary" /> Request Equipment
              </Button>
              <Button
                size="sm"
                onClick={() => navigate("/reservations")}
                className="h-8.5 text-xs font-semibold"
              >
                <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Book Slot
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 2. Primary KPI Section */}
      <section aria-label="Key Performance Indicators">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            title="Total Assets"
            value={stats?.total_equipment ?? 0}
            description={`${stats?.total_units ?? 0} physical units`}
            icon={Boxes}
            tone="navy"
          />
          <StatCard
            title="Available"
            value={stats?.available_equipment ?? 0}
            description={`${stats?.available_units ?? 0} ready to use`}
            icon={CheckCircle2}
            tone="success"
          />
          <StatCard
            title="Borrowed"
            value={stats?.borrowed_units ?? 0}
            description="Currently in loan"
            icon={HandHelping}
            tone="blue"
          />
          <StatCard
            title="In Maintenance"
            value={stats?.under_maintenance ?? 0}
            description={`${stats?.maintenance_units ?? 0} servicing`}
            icon={Wrench}
            tone="amber"
          />
          <StatCard
            title="Pending Requests"
            value={stats?.pending_borrowings ?? 0}
            description={`${stats?.pending_reservations ?? 0} reservations`}
            icon={Clock}
            tone="primary"
          />
          <StatCard
            title="Overdue Returns"
            value={stats?.overdue_returns ?? 0}
            description={stats?.overdue_returns ? "Attention needed" : "All returns clear"}
            icon={AlertTriangle}
            tone={stats?.overdue_returns ? "danger" : "slate"}
          />
        </div>
      </section>

      {/* 3. Analytics & Distribution Section */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Availability and Status Chart */}
        <Card className="lg:col-span-4 border-border bg-card shadow-card">
          <CardHeader className="p-4 pb-2 border-b border-border bg-warm-200/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">
                Equipment Availability
              </CardTitle>
              <span className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider">Status Ratio</span>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            {charts?.status_distribution && charts.status_distribution.length > 0 ? (
              <div className="space-y-3">
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={charts.status_distribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={46}
                        outerRadius={75}
                        paddingAngle={3}
                        stroke="#FBF7EF"
                        strokeWidth={2}
                      >
                        {charts.status_distribution.map((entry) => (
                          <Cell
                            key={entry.status}
                            fill={STATUS_COLORS[entry.status] || "#7891A4"}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#FBF7EF",
                          borderColor: "#DDD4C7",
                          borderRadius: "6px",
                          fontSize: "12px",
                          color: "#29333D",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-border/80 pt-3 text-xs">
                  {charts.status_distribution.slice(0, 4).map((item) => (
                    <div key={item.status} className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-xs"
                        style={{ backgroundColor: STATUS_COLORS[item.status] || "#7891A4" }}
                      />
                      <span className="truncate text-muted-foreground">{item.name}</span>
                      <span className="ml-auto font-semibold text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
                No equipment data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Borrowing Trends Bar Chart */}
        <Card className="lg:col-span-5 border-border bg-card shadow-card">
          <CardHeader className="p-4 pb-2 border-b border-border bg-warm-200/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">
                Monthly Borrowing Trends
              </CardTitle>
              <span className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider">Past 6 Months</span>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            {charts?.monthly_borrowings && charts.monthly_borrowings.length > 0 ? (
              <div className="h-[235px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.monthly_borrowings} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="month"
                      stroke="#716D65"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "#DDD4C7" }}
                    />
                    <YAxis
                      stroke="#716D65"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "#DDD4C7" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FBF7EF",
                        borderColor: "#DDD4C7",
                        borderRadius: "6px",
                        fontSize: "12px",
                        color: "#29333D",
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      iconSize={8}
                      wrapperStyle={{ fontSize: "11px", paddingBottom: "8px" }}
                    />
                    <Bar dataKey="requests" name="Borrow Requests" fill="#426783" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="returns" name="Completed Returns" fill="#557C61" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
                No borrowing history available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Distribution Breakdown */}
        <Card className="lg:col-span-3 border-border bg-card shadow-card">
          <CardHeader className="p-4 pb-2 border-b border-border bg-warm-200/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">
                Category Mix
              </CardTitle>
              <Link to="/equipment" className="text-[11px] font-medium text-primary hover:underline">
                Catalog →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-3 space-y-3">
            {charts?.category_distribution && charts.category_distribution.length > 0 ? (
              charts.category_distribution.slice(0, 5).map((category, idx) => {
                const totalCats = charts.category_distribution.reduce((acc, c) => acc + c.value, 0) || 1;
                const pct = Math.round((category.value / totalCats) * 100);
                return (
                  <div key={category.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground truncate max-w-[140px]">{category.name}</span>
                      <span className="text-muted-foreground font-mono text-[11px]">{category.value} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-warm-200">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex h-36 items-center justify-center text-xs text-muted-foreground">
                No categories found
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 4. Operational Activity Tabs & Tables */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-bold tracking-tight text-foreground">
            Operational Activity & Queues
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-7 text-xs text-muted-foreground"
            >
              <RefreshCw className="mr-1 h-3 w-3" /> Refresh Feed
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-warm-200/60 p-0.5 border border-border">
            <TabsTrigger value="borrowings" className="text-xs px-3 py-1">
              Borrowing Transactions ({recent_borrowings?.length ?? 0})
            </TabsTrigger>
            {isStaff ? (
              <TabsTrigger value="returns" className="text-xs px-3 py-1">
                Return Queue ({return_queue?.length ?? 0})
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="maintenance" className="text-xs px-3 py-1">
              Maintenance ({upcoming_maintenance?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="calibration" className="text-xs px-3 py-1">
              Calibration Reminders ({calibration_due?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="damage" className="text-xs px-3 py-1">
              Damage Reports ({damage_reports?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          {/* Borrowing Transactions Tab */}
          <TabsContent value="borrowings" className="mt-3">
            <Card className="overflow-hidden border-border bg-card shadow-card">
              <div className="p-0">
                {!recent_borrowings || recent_borrowings.length === 0 ? (
                  <EmptyState
                    title="No borrowing transactions found"
                    description="When equipment is issued or requested, transactions will appear here."
                    icon={ClipboardList}
                    compact
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Equipment</TableHead>
                        <TableHead className="hidden sm:table-cell">Borrower</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recent_borrowings.slice(0, 6).map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono text-xs font-semibold text-primary">
                            {b.transaction_code}
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-foreground text-xs leading-none">
                              {b.equipment?.name ?? "Equipment"}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Tag: {b.equipment?.asset_tag ?? "—"}
                            </p>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                            {b.user?.full_name ?? "User"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(b.expected_return_date)}
                            {b.is_overdue ? (
                              <span className="ml-1.5 inline-block text-[10px] font-bold text-danger">
                                Overdue
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={b.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-primary hover:bg-warm-200"
                              onClick={() => navigate("/borrowings")}
                            >
                              Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Return Queue Tab */}
          {isStaff ? (
            <TabsContent value="returns" className="mt-3">
              <Card className="overflow-hidden border-border bg-card shadow-card">
                <div className="p-0">
                  {!return_queue || return_queue.length === 0 ? (
                    <EmptyState
                      title="Return queue is clear"
                      description="No physical returns are awaiting staff verification."
                      icon={CheckCircle2}
                      compact
                    />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Transaction</TableHead>
                          <TableHead>Equipment</TableHead>
                          <TableHead>Borrower</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {return_queue.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-xs font-semibold text-primary">
                              {item.transaction_code}
                            </TableCell>
                            <TableCell className="text-xs font-medium text-foreground">
                              {item.equipment?.name}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.user?.full_name}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={item.status} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => navigate("/returns")}
                              >
                                Verify & Accept
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </Card>
            </TabsContent>
          ) : null}

          {/* Maintenance Tab */}
          <TabsContent value="maintenance" className="mt-3">
            <Card className="overflow-hidden border-border bg-card shadow-card">
              <div className="p-0">
                {!upcoming_maintenance || upcoming_maintenance.length === 0 ? (
                  <EmptyState
                    title="No upcoming maintenance scheduled"
                    description="All equipment servicing is currently up to date."
                    icon={Wrench}
                    compact
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Equipment</TableHead>
                        <TableHead>Scheduled Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {upcoming_maintenance.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-mono text-xs font-semibold text-primary">
                            {m.maintenance_code}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-foreground">
                            {m.equipment?.name}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(m.scheduled_date)}
                          </TableCell>
                          <TableCell className="text-xs capitalize text-muted-foreground">
                            {m.maintenance_type}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={m.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-primary hover:bg-warm-200"
                              onClick={() => navigate("/maintenance")}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Calibration Tab */}
          <TabsContent value="calibration" className="mt-3">
            <Card className="overflow-hidden border-border bg-card shadow-card">
              <div className="p-0">
                {!calibration_due || calibration_due.length === 0 ? (
                  <EmptyState
                    title="No calibration due soon"
                    description="Laboratory instruments meet operational calibration standards."
                    icon={Gauge}
                    compact
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Equipment</TableHead>
                        <TableHead>Asset Tag</TableHead>
                        <TableHead>Next Calibration</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calibration_due.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs font-semibold text-foreground">
                            {c.name}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {c.asset_tag}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(c.next_calibration_date)}
                            {c.days_until !== null && c.days_until !== undefined ? (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                ({c.days_until > 0 ? `in ${c.days_until}d` : `${Math.abs(c.days_until)}d overdue`})
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={c.calibration_status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-primary hover:bg-warm-200"
                              onClick={() => navigate("/calibration")}
                            >
                              Log Calibration
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Damage Reports Tab */}
          <TabsContent value="damage" className="mt-3">
            <Card className="overflow-hidden border-border bg-card shadow-card">
              <div className="p-0">
                {!damage_reports || damage_reports.length === 0 ? (
                  <EmptyState
                    title="No active damage reports"
                    description="No hardware faults or damages reported."
                    icon={CheckCircle2}
                    compact
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Report Code</TableHead>
                        <TableHead>Equipment</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {damage_reports.map((dr) => (
                        <TableRow key={dr.id}>
                          <TableCell className="font-mono text-xs font-semibold text-primary">
                            {dr.report_code}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-foreground">
                            {dr.equipment?.name}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={dr.priority} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={dr.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-primary hover:bg-warm-200"
                              onClick={() => navigate("/damage-reports")}
                            >
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      {/* 5. Recent System Activity (Admins) */}
      {role === "admin" && recent_activity && recent_activity.length > 0 ? (
        <Card className="border-border bg-card shadow-card">
          <CardHeader className="p-4 pb-2 border-b border-border bg-warm-200/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">
                Audit Trail & System Activity
              </CardTitle>
              <span className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider">Live Log</span>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <div className="divide-y divide-border/60">
              {recent_activity.slice(0, 5).map((log) => (
                <div key={log.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <span className="font-medium text-foreground">{log.action}</span>
                    <span className="text-muted-foreground">
                      by {log.user?.full_name || "System"} ({log.entity_type} #{log.entity_id || ""})
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{relativeTime(log.created_at)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
