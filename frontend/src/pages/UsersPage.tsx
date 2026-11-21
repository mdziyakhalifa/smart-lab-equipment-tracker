import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Role, User, Page } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { Pagination } from "@/components/common/pagination";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROLES: { value: string; label: string }[] = [
  { value: "admin", label: "Administrator" },
  { value: "lab_assistant", label: "Lab Assistant" },
  { value: "student", label: "Student" },
  { value: "faculty", label: "Faculty" },
];

const userSchema = z.object({
  full_name: z.string().min(2, "Enter a full name.").max(120),
  email: z.string().email("Enter a valid email address.").max(120),
  username: z.string().min(3, "Username must be at least 3 characters.").max(60).regex(/^[a-zA-Z0-9_.-]+$/, "Use letters, numbers, underscores, dots or hyphens only."),
  role: z.enum(["admin", "lab_assistant", "student", "faculty"] as const),
  department: z.string().max(120).optional(),
  identifier: z.string().max(50).optional(),
  phone: z.string().max(30).optional(),
  is_active: z.boolean(),
  password: z.string().min(8, "Password must be at least 8 characters.").max(64),
});

type UserFormValues = z.infer<typeof userSchema>;

export function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const usersQuery = useQuery({
    queryKey: ["users", { search, roleFilter, activeFilter, page }],
    queryFn: () =>
      api.get<Page<User>>("/users", {
        search: search || undefined,
        role: roleFilter || undefined,
        is_active: activeFilter === "" ? undefined : activeFilter === "true",
        page,
        page_size: 10,
      }),
    placeholderData: (previous) => previous,
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      full_name: "",
      email: "",
      username: "",
      role: "student",
      department: "",
      identifier: "",
      phone: "",
      is_active: true,
      password: "",
    },
  });

  useEffect(() => {
    if (!editing) return;
    reset({
      full_name: editing.full_name,
      email: editing.email,
      username: editing.username,
      role: editing.role,
      department: editing.department ?? "",
      identifier: editing.identifier ?? "",
      phone: editing.phone ?? "",
      is_active: editing.is_active,
      password: "",
    });
  }, [editing, reset]);

  useEffect(() => {
    if (!detailOpen) setSelected(null);
  }, [detailOpen]);

  const saveMutation = useMutation({
    mutationFn: (values: UserFormValues) => {
      const payload = {
        ...values,
        department: values.department || null,
        identifier: values.identifier || null,
        phone: values.phone || null,
      };
      return editing ? api.put<User>(`/users/${editing.id}`, payload) : api.post<User>("/users", payload);
    },
    onSuccess: (user) => {
      toast.success(editing ? "User account updated." : "User account created.");
      setFormOpen(false);
      setEditing(null);
      reset({ full_name: "", email: "", username: "", role: "student", department: "", identifier: "", phone: "", is_active: true, password: "" });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (selected?.id === user.id) setSelected(user);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to save the user account."),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => api.delete<{ message: string }>(`/users/${selected!.id}`),
    onSuccess: (result) => {
      toast.success(result.message);
      setDeleteOpen(false);
      setDetailOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to deactivate the user account."),
  });

  const items = usersQuery.data?.items ?? [];
  const totalUsers = usersQuery.data?.total ?? 0;
  const activeUsers = items.filter((item) => item.is_active).length;
  const adminUsers = items.filter((item) => item.role === "admin").length;

  const filtered = Boolean(search || roleFilter || activeFilter);

  function openCreate() {
    setEditing(null);
    reset({ full_name: "", email: "", username: "", role: "student", department: "", identifier: "", phone: "", is_active: true, password: "" });
    setFormOpen(true);
  }

  function openEdit(item: User) {
    setEditing(item);
    setFormOpen(true);
  }

  function resetFilters() {
    setSearch("");
    setRoleFilter("");
    setActiveFilter("");
    setPage(1);
  }

  const renderDeleteButton = () => {
    if (selected?.is_active) {
      return (
        <>
          <UserX className="h-3.5 w-3.5" /> Deactivate
        </>
      );
    }
    return (
      <>
        <AlertTriangle className="h-3.5 w-3.5" /> Reactivate
      </>
    );
  };

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Manage laboratory accounts, roles and access. User creation and role changes require administrator privileges."
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Add user</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Users" value={totalUsers} description="Registered accounts" icon={UserPlus} tone="navy" />
        <StatCard title="Active" value={activeUsers} description="Currently active accounts" icon={CheckCircle2} tone="success" />
        <StatCard title="Administrators" value={adminUsers} description="Accounts with administrator access" icon={ShieldCheck} tone={adminUsers >= 2 ? "success" : "warning"} />
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 flex-1 xl:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
              <Input
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Search name, email or username…"
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }} className="sm:w-44" aria-label="Filter by role">
                <option value="">All roles</option>
                {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </Select>
              <Select value={activeFilter} onChange={(event) => { setActiveFilter(event.target.value); setPage(1); }} className="sm:w-44" aria-label="Filter by status">
                <option value="">All statuses</option>
                <option value="true">Active</option>
                <option value="false">Deactivated</option>
              </Select>
            </div>
          </div>
          {filtered ? (
            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-foreground-muted">
              Filters applied
              <button className="font-medium text-secondary hover:underline" onClick={resetFilters}>Reset filters</button>
            </div>
          ) : null}
        </div>

        {usersQuery.isLoading ? (
          <TableSkeleton rows={7} columns={5} />
        ) : usersQuery.isError ? (
          <div className="p-4"><ErrorState message={usersQuery.error instanceof Error ? usersQuery.error.message : undefined} onRetry={() => void usersQuery.refetch()} /></div>
        ) : items.length === 0 ? (
          <EmptyState
            title={filtered ? "No users match these filters" : "No users found"}
            description={filtered ? "Try clearing filters or searching for a different account." : "User accounts will appear here."}
            icon={ShieldCheck}
            action={filtered ? <Button variant="secondary" size="sm" onClick={resetFilters}>Clear filters</Button> : <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> Add user</Button>}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden md:table-cell">Role</TableHead>
                  <TableHead className="hidden lg:table-cell">Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => setSelected(item)}>
                    <TableCell>
                      <p className="text-[12.5px] font-medium text-foreground">{item.full_name}</p>
                      <p className="text-[10.5px] text-foreground-muted">{item.email} · {item.username}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-[11.5px] text-foreground-muted">{item.role.replace(/_/g, " ")}</TableCell>
                    <TableCell className="hidden lg:table-cell text-[11.5px] text-foreground-muted">{item.department ?? "—"}</TableCell>
                    <TableCell>
                      {item.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Deactivated</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); setSelected(item); }}>
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {usersQuery.data ? (
              <Pagination
                page={usersQuery.data.page}
                pages={usersQuery.data.pages}
                total={usersQuery.data.total}
                pageSize={usersQuery.data.page_size}
                onPageChange={setPage}
                itemLabel="user accounts"
              />
            ) : null}
          </>
        )}
      </Card>

      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit user account" : "Add user account"}</DialogTitle>
            <DialogDescription>{editing ? "Update the account details and access level." : "Create a new laboratory account."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((values) => saveMutation.mutate(values))} className="space-y-4" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="user-full-name">Full name *</Label>
                <Input id="user-full-name" placeholder="e.g. Jane Doe" {...register("full_name")} />
                {errors.full_name ? <p className="text-[10px] text-foreground-danger">{errors.full_name.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-email">Email *</Label>
                <Input id="user-email" type="email" placeholder="name@labtrack.edu" {...register("email")} />
                {errors.email ? <p className="text-[10px] text-foreground-danger">{errors.email.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-username">Username *</Label>
                <Input id="user-username" placeholder="jdoe" {...register("username")} />
                {errors.username ? <p className="text-[10px] text-foreground-danger">{errors.username.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-role">Role *</Label>
                <Select id="user-role" {...register("role")}>
                  {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="user-department">Department</Label>
                <Input id="user-department" placeholder="e.g. Chemistry department" {...register("department")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-identifier">Identifier</Label>
                <Input id="user-identifier" placeholder="Staff or student ID" {...register("identifier")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-phone">Phone</Label>
                <Input id="user-phone" placeholder="+1 555 000 0000" {...register("phone")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="flex items-start gap-2.5 rounded-md border border-border p-3">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border text-foreground focus:ring-foreground" {...register("is_active")} />
                  <span>
                    <span className="block text-[12.5px] font-medium text-foreground">Active account</span>
                    <span className="block text-[11px] text-foreground-muted">Uncheck to deactivate instead of deleting.</span>
                  </span>
                </label>
              </div>
              {!editing ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="user-password">Password *</Label>
                  <Input id="user-password" type="password" placeholder="At least 8 characters" {...register("password")} />
                  <p className="text-[10px] text-foreground-muted">The demo password is Demo@1234.</p>
                  {errors.password ? <p className="text-[10px] text-foreground-danger">{errors.password.message}</p> : null}
                </div>
              ) : (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="user-password">New password (optional)</Label>
                  <Input id="user-password" type="password" placeholder="Leave blank to keep current" {...register("password")} />
                  <p className="text-[10px] text-foreground-muted">Leave blank to keep the current password unchanged.</p>
                  {errors.password ? <p className="text-[10px] text-foreground-danger">{errors.password.message}</p> : null}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
                {isSubmitting || saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {editing ? "Save changes" : "Create account"}
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
                  <DialogTitle>{selected.full_name}</DialogTitle>
                  <StatusBadge status={selected.role} />
                  {selected.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Deactivated</Badge>}
                </div>
                <DialogDescription>{selected.email} · {selected.username}</DialogDescription>
              </DialogHeader>

              <div className="grid gap-x-5 gap-y-3 rounded-md border border-border p-4 text-[12.5px] sm:grid-cols-2">
                <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Role</dt><dd className="mt-0.5 text-foreground capitalize">{selected.role.replace(/_/g, " ")}</dd></div>
                <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Department</dt><dd className="mt-0.5 text-foreground">{selected.department ?? "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Identifier</dt><dd className="mt-0.5 text-foreground">{selected.identifier ?? "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Phone</dt><dd className="mt-0.5 text-foreground">{selected.phone ?? "—"}</dd></div>
                <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Account status</dt><dd className="mt-0.5 text-foreground">{selected.is_active ? "Active" : "Deactivated"}</dd></div>
                <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Last login</dt><dd className="mt-0.5 text-foreground-muted">{selected.last_login_at ? new Date(selected.last_login_at).toLocaleString() : "Never"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Created</dt><dd className="mt-0.5 text-foreground">{new Date(selected.created_at).toLocaleString()}</dd></div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setDetailOpen(false); openEdit(selected); }}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                  >
                    {renderDeleteButton()}
                  </Button>
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
        title={`Deactivate ${selected?.full_name ?? "this user"}?`}
        description={selected ? `The account ${selected.email} will be deactivated and can no longer sign in. At least one active administrator must remain.` : ""}
        confirmLabel={selected?.is_active ? "Deactivate account" : "Reactivate account"}
        destructive
        loading={deactivateMutation.isPending}
        onConfirm={() => deactivateMutation.mutate()}
      />
    </div>
  );
}