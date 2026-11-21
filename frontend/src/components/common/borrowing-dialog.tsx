import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import type { Borrowing } from "@/types";
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
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

interface BorrowingDialogProps {
  borrowing: Borrowing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (borrowing: Borrowing) => void;
}

type Action = "reject" | "return" | "cancel" | null;

const conditions = ["excellent", "good", "fair", "poor", "damaged"];

export function BorrowingDialog({ borrowing, open, onOpenChange, onUpdated }: BorrowingDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [record, setRecord] = useState<Borrowing | null>(borrowing);
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setRecord(borrowing);
      setAction(null);
      setReason("");
      setNotes("");
      setCondition("good");
    }
  }, [borrowing, open]);

  const mutation = useMutation({
    mutationFn: async (payload: { path: string; body?: unknown }) =>
      api.put<Borrowing>(`/borrowings/${record!.id}/${payload.path}`, payload.body),
    onSuccess: (updated) => {
      setRecord(updated);
      setAction(null);
      onUpdated?.(updated);
      void queryClient.invalidateQueries({ queryKey: ["borrowings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Borrowing record updated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to update the record."),
  });

  if (!record || !user) return null;

  const staff = user.role === "admin" || user.role === "lab_assistant";
  const owner = record.user_id === user.id;
  const canApprove = staff && record.status === "pending";
  const canIssue = staff && record.status === "approved";
  const canReturn = staff && ["issued", "return_requested", "overdue"].includes(record.status);
  const canRequestReturn = owner && ["issued", "overdue"].includes(record.status);
  const canCancel = owner && ["pending", "approved"].includes(record.status);
  const hasActions = canApprove || canIssue || canReturn || canRequestReturn || canCancel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="font-mono text-base">{record.transaction_code}</DialogTitle>
            <StatusBadge status={record.status} />
            {record.is_overdue ? <StatusBadge status="overdue" label="Overdue" /> : null}
          </div>
          <DialogDescription>
            Requested {formatDateTime(record.request_date)} by {record.user.full_name}
          </DialogDescription>
        </DialogHeader>

        {record.is_overdue ? (
          <Alert variant="danger" title="Return is overdue">
            This loan was due on {formatDate(record.expected_return_date)}. Contact the borrower and record the return as soon as the equipment is recovered.
          </Alert>
        ) : null}

        <div className="rounded-md border border-border bg-warm-100/60">
          <div className="flex items-start gap-3 border-b border-border/80 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{record.equipment.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {record.equipment.asset_tag} · {record.equipment.category_name ?? "Uncategorized"} · {record.equipment.laboratory_name ?? "No laboratory"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Quantity requested: <span className="font-semibold text-foreground">{record.quantity}</span></p>
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Borrower</dt>
              <dd className="mt-0.5 font-medium text-foreground">{record.user.full_name}</dd>
              <dd className="text-xs text-muted-foreground">{record.user.email}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Expected return</dt>
              <dd className={`mt-0.5 font-medium ${record.is_overdue ? "text-danger" : "text-foreground"}`}>{formatDate(record.expected_return_date)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Approved by</dt>
              <dd className="mt-0.5 text-foreground">{record.approved_by?.full_name ?? "Pending approval"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Issued by</dt>
              <dd className="mt-0.5 text-foreground">{record.issued_by?.full_name ?? "Not issued"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Purpose</dt>
              <dd className="mt-0.5 text-foreground">{record.purpose || "No purpose provided."}</dd>
            </div>
            {record.borrowed_assets.length > 0 ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Assigned assets</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {record.borrowed_assets.map((item) => (
                    <span key={item.id} className="rounded border border-border bg-card px-2 py-0.5 font-mono text-[11px] text-foreground">
                      {item.asset.asset_code}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
            {record.rejection_reason ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rejection reason</dt>
                <dd className="mt-0.5 text-danger">{record.rejection_reason}</dd>
              </div>
            ) : null}
            {record.notes ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notes</dt>
                <dd className="mt-0.5 text-foreground">{record.notes}</dd>
              </div>
            ) : null}
            {record.actual_return_date ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Returned</dt>
                <dd className="mt-0.5 text-foreground">
                  {formatDateTime(record.actual_return_date)} · Condition: {humanize(record.return_condition)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {action === "reject" ? (
          <div className="space-y-2 rounded-md border border-warning/30 bg-warning-background/60 p-3.5">
            <Label htmlFor="reject-reason">Reason for rejection</Label>
            <Textarea id="reject-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this request cannot be approved…" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAction(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ path: "reject", body: { reason: reason || null } })}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject request
              </Button>
            </div>
          </div>
        ) : null}

        {action === "return" ? (
          <div className="space-y-3 rounded-md border border-success/30 bg-success-background/60 p-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="return-condition">Returned condition</Label>
                <Select id="return-condition" value={condition} onChange={(event) => setCondition(event.target.value)}>
                  {conditions.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="return-notes">Notes (optional)</Label>
                <Textarea id="return-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Accessories returned, observations…" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAction(null)}>Cancel</Button>
              <Button variant="success" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ path: "return", body: { condition, notes: notes || null } })}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Record return
              </Button>
            </div>
          </div>
        ) : null}

        {action === "cancel" ? (
          <div className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger-background/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-danger">Cancel this borrowing request? This action cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAction(null)}>Keep request</Button>
              <Button variant="destructive" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ path: "cancel" })}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Cancel request
              </Button>
            </div>
          </div>
        ) : null}

        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">Last updated {formatDateTime(record.updated_at)}</p>
          <div className="flex flex-wrap gap-2">
            {canApprove && action === null ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setAction("reject")}><X className="mr-1 h-3.5 w-3.5" /> Reject</Button>
                <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ path: "approve" })}>
                  {mutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Approve request
                </Button>
              </>
            ) : null}
            {canIssue && action === null ? (
              <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ path: "issue" })}>
                {mutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="mr-1 h-3.5 w-3.5" />} Issue equipment
              </Button>
            ) : null}
            {canReturn && action === null ? (
              <Button variant="success" size="sm" onClick={() => setAction("return")}><Undo2 className="mr-1 h-3.5 w-3.5" /> Record return</Button>
            ) : null}
            {canRequestReturn && action === null ? (
              <Button variant="secondary" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ path: "request-return", body: {} })}>
                {mutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />} Request return
              </Button>
            ) : null}
            {canCancel && action === null ? (
              <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-background hover:text-danger" onClick={() => setAction("cancel")}>
                <X className="mr-1 h-3.5 w-3.5" /> Cancel request
              </Button>
            ) : null}
            {!hasActions ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" /> No actions available for this record.
              </p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BorrowingStatusLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Active records require staff action
    </div>
  );
}
