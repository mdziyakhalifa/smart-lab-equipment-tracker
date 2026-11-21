import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  HandHelping,
  Info,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Borrowing, Equipment, Page } from "@/types";
import { addDaysInput, formatDate, percent, todayInput } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { EquipmentThumb } from "@/components/common/equipment-thumb";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const schema = z
  .object({
    equipment_id: z.coerce.number().min(1, "Select equipment to borrow."),
    quantity: z.coerce.number().int("Enter a whole number.").min(1, "At least one unit is required.").max(50, "Maximum 50 units per request."),
    expected_return_date: z.string().min(1, "Select an expected return date."),
    purpose: z.string().max(500, "Purpose cannot exceed 500 characters.").optional(),
  })
  .refine((values) => values.expected_return_date >= todayInput(), {
    message: "The expected return date cannot be in the past.",
    path: ["expected_return_date"],
  })
  .refine((values) => values.expected_return_date <= addDaysInput(90), {
    message: "Borrowing periods cannot exceed 90 days.",
    path: ["expected_return_date"],
  });

type FormValues = z.infer<typeof schema>;

export function BorrowPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const preselected = Number(searchParams.get("equipment") ?? 0);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      equipment_id: preselected || 0,
      quantity: 1,
      expected_return_date: addDaysInput(7),
      purpose: "",
    },
  });

  const equipmentId = watch("equipment_id");

  const equipmentQuery = useQuery({
    queryKey: ["equipment", "borrow-list", debouncedSearch],
    queryFn: () => api.get<Page<Equipment>>("/equipment", { search: debouncedSearch || undefined, availability: "available", page_size: 100 }),
  });

  const selectedQuery = useQuery({
    queryKey: ["equipment", "detail", equipmentId],
    queryFn: () => api.get<Equipment>(`/equipment/${equipmentId}`),
    enabled: Boolean(equipmentId),
  });

  const historyQuery = useQuery({
    queryKey: ["borrowings", "my-recent"],
    queryFn: () => api.get<Page<Borrowing>>("/borrowings", { page_size: 5 }),
  });

  const selected = selectedQuery.data ?? equipmentQuery.data?.items.find((item) => item.id === equipmentId);
  const maxQuantity = selected?.available_quantity ?? 50;

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post<Borrowing>("/borrowings", {
        equipment_id: values.equipment_id,
        quantity: values.quantity,
        expected_return_date: values.expected_return_date,
        purpose: values.purpose || null,
      }),
    onSuccess: (borrowing) => {
      toast.success(`Request ${borrowing.transaction_code} submitted for approval.`);
      void queryClient.invalidateQueries({ queryKey: ["borrowings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      reset({ equipment_id: 0, quantity: 1, expected_return_date: addDaysInput(7), purpose: "" });
      navigate("/borrowings");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to submit the request."),
  });

  const availableEquipment = useMemo(() => equipmentQuery.data?.items ?? [], [equipmentQuery.data]);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Borrowing"
        title="Request equipment"
        description="Submit a borrowing request for laboratory equipment. Requests are reviewed and issued by laboratory staff."
        actions={<Button variant="secondary" asChild><Link to="/borrowings"><ClipboardList className="h-4 w-4" /> My borrowing records</Link></Button>}
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Borrowing request</CardTitle>
              <CardDescription>All fields marked with an asterisk are required.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="equipment-search">Find equipment</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                    <Input id="equipment-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search available equipment…" className="pl-9" />
                  </div>
                  <Select id="equipment_id" aria-label="Select equipment" {...register("equipment_id")}>
                    <option value={0}>Select equipment…</option>
                    {availableEquipment.map((equipment) => (
                      <option key={equipment.id} value={equipment.id}>
                        {equipment.name} — {equipment.asset_tag} ({equipment.available_quantity} available)
                      </option>
                    ))}
                  </Select>
                  {equipmentQuery.isError ? <p className="text-[10px] text-foreground-danger">Unable to load equipment list.</p> : null}
                  {errors.equipment_id ? <p className="text-[10px] text-foreground-danger">{errors.equipment_id.message}</p> : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="quantity">Quantity *</Label>
                    <Input id="quantity" type="number" min={1} max={maxQuantity} {...register("quantity")} />
                    <p className="text-[10px] text-foreground-muted">{selected ? `${selected.available_quantity} unit${selected.available_quantity === 1 ? "" : "s"} currently available.` : "Select equipment to see availability."}</p>
                    {errors.quantity ? <p className="text-[10px] text-foreground-danger">{errors.quantity.message}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="expected_return_date">Expected return date *</Label>
                    <Input id="expected_return_date" type="date" min={todayInput()} max={addDaysInput(90)} {...register("expected_return_date")} />
                    {errors.expected_return_date ? <p className="text-[10px] text-foreground-danger">{errors.expected_return_date.message}</p> : null}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="purpose">Purpose of use</Label>
                  <Textarea id="purpose" rows={4} placeholder="Describe the experiment, project or course activity…" {...register("purpose")} />
                  {errors.purpose ? <p className="text-[10px] text-foreground-danger">{errors.purpose.message}</p> : null}
                </div>

                <Alert variant="info" title="What happens next?">
                  Your request is sent to the laboratory team. Once approved, collect the equipment from the laboratory. You can track the status under Borrowing Records.
                </Alert>

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={isSubmitting || mutation.isPending || !selected}>
                    {isSubmitting || mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandHelping className="h-4 w-4" />}
                    Submit request
                  </Button>
                  <Button type="button" variant="secondary" asChild><Link to="/equipment">Browse full inventory</Link></Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Available equipment</CardTitle>
                <CardDescription>Quickly choose an item from the current availability list.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild><Link to="/equipment">View inventory <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
            </CardHeader>
            <CardContent>
              {equipmentQuery.isLoading ? (
                <p className="py-6 text-center text-[11px] text-foreground-muted">Loading available equipment…</p>
              ) : equipmentQuery.isError ? (
                <ErrorState message={equipmentQuery.error instanceof Error ? equipmentQuery.error.message : undefined} onRetry={() => void equipmentQuery.refetch()} />
              ) : availableEquipment.length === 0 ? (
                <EmptyState compact title="No available equipment" description="No equipment currently matches this search with available units." icon={Search} />
              ) : (
                <div className="divide-y border-border">
                  {availableEquipment.slice(0, 6).map((equipment) => (
                    <button
                      key={equipment.id}
                      type="button"
                      onClick={() => { setValue("equipment_id", equipment.id, { shouldValidate: true }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className={`flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-card ${equipment.id === equipmentId ? "bg-warm-100/30" : ""}`}
                    >
                      <EquipmentThumb category={equipment.category?.name} className="h-9 w-9" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-foreground">{equipment.name}</p>
                        <p className="truncate text-[10.5px] text-foreground-muted">{equipment.asset_tag} · {equipment.laboratory?.name ?? "No laboratory"}</p>
                      </div>
                      <div className="w-24 shrink-0">
                        <div className="flex items-center justify-between text-[10px] text-foreground-muted"><span>{equipment.available_quantity}/{equipment.quantity}</span><span>{percent(equipment.available_quantity, equipment.quantity)}%</span></div>
                        <Progress value={percent(equipment.available_quantity, equipment.quantity)} className="mt-1 h-1" indicatorClassName="secondary" />
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-foreground-muted" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Selected equipment</CardTitle>
              <CardDescription>Review details before submitting.</CardDescription>
            </CardHeader>
            <CardContent>
              {!selected ? (
                <EmptyState compact title="Nothing selected" description="Choose equipment from the list to preview availability." icon={HandHelping} />
              ) : (
                <div>
                  <div className="flex items-start gap-3">
                    <EquipmentThumb category={selected.category?.name} className="h-11 w-11" />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-foreground">{selected.name}</p>
                      <p className="text-[11px] text-foreground-muted">{selected.asset_tag} · {selected.category?.name ?? "Uncategorized"}</p>
                      <div className="mt-1.5"><StatusBadge status={selected.status} /></div>
                    </div>
                  </div>
                  <Separator className="my-3" />
                  <dl className="space-y-2 text-[12px]">
                    <div className="flex items-center justify-between"><dt className="text-foreground-muted">Laboratory</dt><dd className="font-medium text-foreground">{selected.laboratory?.name ?? "—"}</dd></div>
                    <div className="flex items-center justify-between"><dt className="text-foreground-muted">Location</dt><dd className="font-medium text-foreground">{selected.laboratory?.building ?? "—"}{selected.laboratory?.room ? ` · ${selected.laboratory.room}` : ""}</dd></div>
                    <div className="flex items-center justify-between"><dt className="text-foreground-muted">Condition</dt><dd className="font-medium text-foreground capitalize">{selected.condition}</dd></div>
                    <div className="flex items-center justify-between"><dt className="text-foreground-muted">Available</dt><dd className="font-semibold text-success">{selected.available_quantity} of {selected.quantity} units</dd></div>
                    <div className="flex items-center justify-between"><dt className="text-foreground-muted">Next calibration</dt><dd className="font-medium text-foreground">{formatDate(selected.next_calibration_date)}</dd></div>
                  </dl>
                  <Progress value={percent(selected.available_quantity, selected.quantity)} className="mt-3 h-1.5" indicatorClassName="secondary" />
                  <Button variant="secondary" size="sm" className="mt-3 w-full" asChild><Link to={`/equipment/${selected.id}`}>Open equipment record</Link></Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Borrowing guidelines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[12px] leading-5 text-foreground-muted">
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> Requests are reviewed by laboratory staff before equipment is issued.</p>
              <p className="flex gap-2"><CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" /> Standard borrowing periods may not exceed 90 days.</p>
              <p className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> One active request per equipment item is allowed at a time.</p>
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> Return equipment on or before the due date in the condition it was issued.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Recent requests</CardTitle>
                <CardDescription>Your latest borrowing activity</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild><Link to="/borrowings">All</Link></Button>
            </CardHeader>
            <CardContent>
              {(historyQuery.data?.items.length ?? 0) === 0 ? (
                <EmptyState compact title="No requests yet" description="Your borrowing requests will appear here." icon={ClipboardList} />
              ) : (
                <div className="space-y-2">
                  {historyQuery.data?.items.map((borrowing) => (
                    <div key={borrowing.id} className="rounded-md border border-border px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[12px] font-medium text-foreground">{borrowing.equipment.name}</p>
                        <StatusBadge status={borrowing.status} />
                      </div>
                      <p className="mt-0.5 text-[10.5px] text-foreground-muted">{borrowing.transaction_code} · Due {formatDate(borrowing.expected_return_date)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}