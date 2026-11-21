import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Building2,
  CheckCircle2,
  Edit2,
  FolderPlus,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Laboratory } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const labSchema = z.object({
  name: z.string().min(2, "Laboratory name must be at least 2 characters."),
  code: z.string().min(2, "Laboratory code must be at least 2 characters."),
  building: z.string().optional(),
  room: z.string().optional(),
  contact_person: z.string().optional(),
  description: z.string().optional(),
});

type LabFormValues = z.infer<typeof labSchema>;

export function LabsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Laboratory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Laboratory | null>(null);

  const isAdmin = user?.role === "admin";

  const labsQuery = useQuery({
    queryKey: ["labs"],
    queryFn: () => api.get<Laboratory[]>("/labs"),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LabFormValues>({
    resolver: zodResolver(labSchema),
    defaultValues: {
      name: "",
      code: "",
      building: "",
      room: "",
      contact_person: "",
      description: "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: (values: LabFormValues) => {
      if (editing) {
        return api.put<Laboratory>(`/labs/${editing.id}`, values);
      }
      return api.post<Laboratory>("/labs", values);
    },
    onSuccess: () => {
      toast.success(editing ? "Laboratory updated successfully." : "Laboratory created successfully.");
      setFormOpen(false);
      setEditing(null);
      reset();
      void queryClient.invalidateQueries({ queryKey: ["labs"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save laboratory details.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (labId: number) => api.delete<{ message: string }>(`/labs/${labId}`),
    onSuccess: () => {
      toast.success("Laboratory removed successfully.");
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["labs"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not delete laboratory (ensure no assets are assigned).");
    },
  });

  function openCreate() {
    setEditing(null);
    reset({
      name: "",
      code: "",
      building: "",
      room: "",
      contact_person: "",
      description: "",
    });
    setFormOpen(true);
  }

  function openEdit(lab: Laboratory) {
    setEditing(lab);
    reset({
      name: lab.name,
      code: lab.code,
      building: lab.building || "",
      room: lab.room || "",
      contact_person: lab.contact_person || "",
      description: lab.description || "",
    });
    setFormOpen(true);
  }

  const allLabs = labsQuery.data ?? [];
  const filteredLabs = useMemo(() => {
    if (!search.trim()) return allLabs;
    const term = search.toLowerCase();
    return allLabs.filter(
      (l) =>
        l.name.toLowerCase().includes(term) ||
        l.code.toLowerCase().includes(term) ||
        (l.building && l.building.toLowerCase().includes(term)) ||
        (l.room && l.room.toLowerCase().includes(term)),
    );
  }, [allLabs, search]);

  const totalEquipmentCount = useMemo(() => {
    return allLabs.reduce((sum, l) => sum + (l.equipment_count || 0), 0);
  }, [allLabs]);

  return (
    <div className="page-container space-y-6 pb-12">
      <PageHeader
        eyebrow="Administration"
        title="Laboratory Management"
        description="Facility registry and room spaces. Manage research spaces, departmental room allocations, and equipment assignments."
        actions={
          isAdmin ? (
            <Button size="sm" onClick={openCreate} className="h-8.5 font-semibold text-xs">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Laboratory
            </Button>
          ) : undefined
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <StatCard
          title="Total Laboratories"
          value={allLabs.length}
          description="Registered lab facilities"
          icon={Building2}
          tone="navy"
        />
        <StatCard
          title="Assigned Equipment"
          value={totalEquipmentCount}
          description="Assets deployed in labs"
          icon={Boxes}
          tone="primary"
        />
        <StatCard
          title="Active Research Spaces"
          value={allLabs.filter((l) => (l.equipment_count || 0) > 0).length}
          description="Rooms with active instruments"
          icon={CheckCircle2}
          tone="green"
        />
      </div>

      {/* Main Table Card */}
      <Card className="overflow-hidden border-border bg-card shadow-card">
        <div className="border-b border-border bg-warm-200/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by lab name, code, or building…"
                className="pl-8 text-xs h-8.5 bg-warm-100"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              Showing {filteredLabs.length} of {allLabs.length} facilities
            </span>
          </div>
        </div>

        {labsQuery.isLoading ? (
          <TableSkeleton rows={4} columns={5} />
        ) : labsQuery.isError ? (
          <div className="p-6">
            <ErrorState
              title="Failed to load laboratory facilities"
              message="Could not contact the database server."
              onRetry={() => labsQuery.refetch()}
            />
          </div>
        ) : filteredLabs.length === 0 ? (
          <EmptyState
            title="No laboratories found"
            description={
              search ? "No labs matched your search term." : "No laboratory rooms have been created yet."
            }
            icon={Building2}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Laboratory Name</TableHead>
                <TableHead>Building & Room</TableHead>
                <TableHead>Contact Lead</TableHead>
                <TableHead>Instruments</TableHead>
                {isAdmin ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLabs.map((lab) => (
                <TableRow key={lab.id}>
                  <TableCell className="font-mono text-xs font-semibold text-primary">
                    {lab.code}
                  </TableCell>
                  <TableCell>
                    <p className="font-semibold text-xs text-foreground">{lab.name}</p>
                    {lab.description ? (
                      <p className="text-[11px] text-muted-foreground truncate max-w-xs">{lab.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground/70" />
                      {lab.building || "Main Campus"} {lab.room ? `• Room ${lab.room}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 text-muted-foreground/70" />
                      {lab.contact_person || "Staff Administrator"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full border border-border bg-warm-200/60 px-2 py-0.5 text-[11px] font-medium text-foreground">
                      {lab.equipment_count || 0} assets
                    </span>
                  </TableCell>
                  {isAdmin ? (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-primary hover:bg-warm-200"
                          onClick={() => openEdit(lab)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-danger hover:bg-danger-background hover:text-danger"
                          onClick={() => setDeleteTarget(lab)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add / Edit Laboratory Dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            reset();
          }
        }}
      >
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Laboratory" : "Create Laboratory"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update room assignments and facility information."
                : "Add a new laboratory facility for equipment and scheduling allocations."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit((values) => saveMutation.mutate(values))} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="lab-name">Facility Name *</Label>
                <Input id="lab-name" placeholder="e.g. Robotics & Controls Lab" {...register("name")} />
                {errors.name ? <p className="text-[11px] text-danger">{errors.name.message}</p> : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="lab-code">Lab Code *</Label>
                <Input id="lab-code" placeholder="e.g. LAB-ROB-01" {...register("code")} />
                {errors.code ? <p className="text-[11px] text-danger">{errors.code.message}</p> : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="lab-building">Building</Label>
                <Input id="lab-building" placeholder="e.g. Engineering Hall" {...register("building")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lab-room">Room Number</Label>
                <Input id="lab-room" placeholder="e.g. 302B" {...register("room")} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="lab-contact">Contact Person / Lab In-Charge</Label>
              <Input id="lab-contact" placeholder="e.g. Dr. Robert Miller" {...register("contact_person")} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="lab-desc">Description & Specialized Functions</Label>
              <Textarea
                id="lab-desc"
                rows={2}
                placeholder="Brief summary of research areas, safety gear requirements, or access restrictions..."
                {...register("description")}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
                {isSubmitting || saveMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {editing ? "Save Changes" : "Create Laboratory"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete laboratory "${deleteTarget?.name}"?`}
        description="Are you sure you want to remove this laboratory? This action cannot be undone. Laboratories with assigned equipment cannot be deleted until assets are reassigned."
        confirmLabel="Delete Facility"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
