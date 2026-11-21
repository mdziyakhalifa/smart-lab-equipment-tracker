import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Reservation } from "@/types";
import { formatDate, formatTime, humanize } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/common/status-badge";
import { Separator } from "@/components/ui/separator";

interface ReservationDetailDialogProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (reservation: Reservation) => void;
}

export function ReservationDetailDialog({ reservation, open, onOpenChange, onUpdated }: ReservationDetailDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [record, setRecord] = useState<Reservation | null>(reservation);
  const [mode, setMode] = useState<"reject" | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setRecord(reservation);
      setMode(null);
      setNote("");
    }
  }, [open, reservation]);

  const mutation = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown }) =>
      api.put<Reservation>(`/reservations/${record!.id}/${action}`, body),
    onSuccess: (updated) => {
      setRecord(updated);
      setMode(null);
      onUpdated?.(updated);
      void queryClient.invalidateQueries({ queryKey: ["reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Reservation updated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to update the reservation."),
  });

  if (!record || !user) return null;

  const staff = user.role === "admin" || user.role === "lab_assistant";
  const owner = record.user_id === user.id;
  const canDecide = staff && record.status === "pending";
  const canReject = staff && (record.status === "pending" || record.status === "approved");
  const canCancel = (owner || staff) && (record.status === "pending" || record.status === "approved");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{record.reservation_code}</DialogTitle>
            <StatusBadge status={record.status} />
          </div>
          <DialogDescription>Reservation details and laboratory decision.</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-card/60 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{record.equipment.name}</p>
              <p className="text-[11px] text-foreground-muted">{record.equipment.asset_tag} · {record.equipment.laboratory_name ?? "No laboratory"}</p>
            </div>
          </div>
          <dl className="mt-4 grid gap-x-5 gap-y-3 text-[12.5px] sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Reserved by</dt>
              <dd className="mt-0.5 text-foreground">{record.user.full_name}</dd>
              <dd className="text-[11px] text-foreground-muted">{record.user.email}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Quantity</dt>
              <dd className="mt-0.5 text-foreground">{record.quantity} unit{record.quantity === 1 ? "" : "s"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Date</dt>
              <dd className="mt-0.5 text-foreground">{formatDate(record.reservation_date)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Time window</dt>
              <dd className="mt-0.5 text-foreground">{formatTime(record.start_time)} – {formatTime(record.end_time)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Purpose</dt>
              <dd className="mt-0.5 text-foreground">{record.purpose || "No purpose provided."}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Approved by</dt>
              <dd className="mt-0.5 text-foreground">{record.approved_by?.full_name ?? "Pending"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Decision note</dt>
              <dd className="mt-0.5 text-foreground">{record.decision_note || "—"}</dd>
            </div>
          </dl>
        </div>

        {mode === "reject" ? (
          <div className="space-y-2 rounded-md border border-warning bg-warning-faint p-3">
            <Label htmlFor="reservation-reject-note">Reason for rejection</Label>
            <Textarea id="reservation-reject-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain why the slot cannot be approved…" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setMode(null)}>Back</Button>
              <Button variant="destructive" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "reject", body: { note: note || null } })}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject reservation
              </Button>
            </div>
          </div>
        ) : null}

        <Separator />
        <div className="flex flex-wrap justify-end gap-2">
          {canCancel && mode === null ? (
            <Button variant="ghost" size="sm" className="text-foreground-danger hover:bg-danger-faint hover:text-foreground-danger" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "cancel" })}>
              Cancel reservation
            </Button>
          ) : null}
          {canReject && mode === null ? (
            <Button variant="secondary" size="sm" onClick={() => setMode("reject")}><X className="h-3.5 w-3.5" /> Reject</Button>
          ) : null}
          {canDecide && mode === null ? (
            <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "approve", body: { note: "Approved by laboratory staff." } })}>
              {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
            </Button>
          ) : null}
          {!canCancel && !canReject && !canDecide ? (
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          ) : null}
        </div>
        <p className="text-right text-[10px] text-foreground-muted">Status: {humanize(record.status)}</p>
      </DialogContent>
    </Dialog>
  );
}
