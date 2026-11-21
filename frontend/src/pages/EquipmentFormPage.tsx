import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Category, Equipment, Laboratory } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { ImageUpload } from "@/components/common/image-upload";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
  z.number({ invalid_type_error: "Enter a valid number." }).min(0, "Value cannot be negative.").optional(),
);

const schema = z
  .object({
    name: z.string().min(2, "Equipment name must be at least 2 characters."),
    asset_tag: z.string().max(40).optional(),
    category_id: z.coerce.number().min(1, "Select a category."),
    laboratory_id: z.coerce.number().min(1, "Select a laboratory."),
    description: z.string().max(2000).optional(),
    manufacturer: z.string().max(120).optional(),
    model_number: z.string().max(120).optional(),
    serial_number: z.string().max(120).optional(),
    quantity: z.coerce.number().int("Quantity must be a whole number.").min(1, "Quantity must be at least 1.").max(500, "Maximum quantity is 500."),
    purchase_date: z.string().optional(),
    purchase_price: optionalNumber,
    condition: z.enum(["excellent", "good", "fair", "poor", "damaged"]),
    calibration_required: z.boolean(),
    last_calibration_date: z.string().optional(),
    next_calibration_date: z.string().optional(),
    image_url: z.string().nullable().optional(),
  })
  .refine(
    (values) => !values.last_calibration_date || !values.next_calibration_date || values.next_calibration_date >= values.last_calibration_date,
    { message: "Next calibration date cannot be before the last calibration date.", path: ["next_calibration_date"] },
  );

type FormValues = z.infer<typeof schema>;

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-[10px] text-foreground-danger">{message}</p> : null;
}

export function EquipmentFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const equipmentId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });
  const labsQuery = useQuery({ queryKey: ["labs"], queryFn: () => api.get<Laboratory[]>("/labs") });
  const equipmentQuery = useQuery({
    queryKey: ["equipment", "detail", equipmentId],
    queryFn: () => api.get<Equipment>(`/equipment/${equipmentId}`),
    enabled: editing && Number.isFinite(equipmentId),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      asset_tag: "",
      category_id: 0,
      laboratory_id: 0,
      description: "",
      manufacturer: "",
      model_number: "",
      serial_number: "",
      quantity: 1,
      purchase_date: "",
      purchase_price: undefined,
      condition: "good",
      calibration_required: false,
      last_calibration_date: "",
      next_calibration_date: "",
      image_url: null,
    },
  });

  useEffect(() => {
    if (!equipmentQuery.data) return;
    const equipment = equipmentQuery.data;
    reset({
      name: equipment.name,
      asset_tag: equipment.asset_tag,
      category_id: equipment.category_id,
      laboratory_id: equipment.laboratory_id,
      description: equipment.description ?? "",
      manufacturer: equipment.manufacturer ?? "",
      model_number: equipment.model_number ?? "",
      serial_number: equipment.serial_number ?? "",
      quantity: equipment.quantity,
      purchase_date: equipment.purchase_date ?? "",
      purchase_price: equipment.purchase_price ?? undefined,
      condition: (equipment.condition as FormValues["condition"]) ?? "good",
      calibration_required: equipment.calibration_required,
      last_calibration_date: equipment.last_calibration_date ?? "",
      next_calibration_date: equipment.next_calibration_date ?? "",
      image_url: equipment.image_url ?? null,
    });
  }, [equipmentQuery.data, reset]);

  const imageUrl = watch("image_url");

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        ...values,
        asset_tag: values.asset_tag?.trim() || undefined,
        description: values.description || null,
        manufacturer: values.manufacturer || null,
        model_number: values.model_number || null,
        serial_number: values.serial_number || null,
        purchase_date: values.purchase_date || null,
        purchase_price: values.purchase_price ?? null,
        last_calibration_date: values.last_calibration_date || null,
        next_calibration_date: values.next_calibration_date || null,
        image_url: values.image_url || null,
      };
      return editing
        ? api.put<Equipment>(`/equipment/${equipmentId}`, payload)
        : api.post<Equipment>("/equipment", payload);
    },
    onSuccess: (equipment) => {
      toast.success(editing ? "Equipment updated successfully." : "Equipment registered successfully.");
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/equipment/${equipment.id}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to save the equipment record."),
  });

  async function onSubmit(values: FormValues) {
    await mutation.mutateAsync(values);
  }

  if (editing && equipmentQuery.isLoading) return <div className="page-container"><PageSkeleton /></div>;
  if (editing && (equipmentQuery.isError || !equipmentQuery.data)) {
    return (
      <div className="page-container">
        <ErrorState title="Unable to load equipment" message={equipmentQuery.error instanceof Error ? equipmentQuery.error.message : undefined} onRetry={() => void equipmentQuery.refetch()} />
      </div>
    );
  }

  return (
    <div className="page-container max-w-[1100px]">
      <PageHeader
        backTo={editing ? `/equipment/${equipmentId}` : "/equipment"}
        eyebrow={editing ? "Edit inventory" : "New inventory record"}
        title={editing ? "Edit equipment" : "Register equipment"}
        description={
          editing
            ? "Update the equipment specification, stock level and calibration schedule."
            : "Create an equipment record. A unique QR asset tag and physical asset codes are generated automatically."
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5 lg:grid-cols-3" noValidate>
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Equipment details</CardTitle>
              <CardDescription>Core identification and specification information.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">Equipment name *</Label>
                <Input id="name" placeholder="e.g. Digital Oscilloscope" {...register("name")} />
                <FieldError message={errors.name?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset_tag">Asset tag</Label>
                <Input id="asset_tag" placeholder="Auto-generated if left blank" className="font-mono" {...register("asset_tag")} />
                <FieldError message={errors.asset_tag?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="serial_number">Serial number</Label>
                <Input id="serial_number" placeholder="Manufacturer serial number" className="font-mono" {...register("serial_number")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category_id">Category *</Label>
                <Select id="category_id" {...register("category_id")}>
                  <option value="">Select category...</option>
                  {(categoriesQuery.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </Select>
                <FieldError message={errors.category_id?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="laboratory_id">Laboratory *</Label>
                <Select id="laboratory_id" {...register("laboratory_id")}>
                  <option value="">Select laboratory...</option>
                  {(labsQuery.data ?? []).map((lab) => <option key={lab.id} value={lab.id}>{lab.name} ({lab.code})</option>)}
                </Select>
                <FieldError message={errors.laboratory_id?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input id="manufacturer" placeholder="e.g. Tektronix" {...register("manufacturer")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model_number">Model number</Label>
                <Input id="model_number" placeholder="e.g. TBS2000B" {...register("model_number")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" rows={4} placeholder="Capabilities, included accessories, usage notes…" {...register("description")} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acquisition & condition</CardTitle>
              <CardDescription>Purchase information and the current physical condition.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="purchase_date">Purchase date</Label>
                <Input id="purchase_date" type="date" {...register("purchase_date")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase_price">Purchase price (USD)</Label>
                <Input id="purchase_price" type="number" min="0" step="0.01" placeholder="0.00" {...register("purchase_price")} />
                <FieldError message={errors.purchase_price?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="condition">Condition *</Label>
                <Select id="condition" {...register("condition")}>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                  <option value="damaged">Damaged</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Equipment photo</Label>
                <ImageUpload value={imageUrl} onChange={(url) => setValue("image_url", url)} label="Upload equipment photo" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
              <CardDescription>Physical units available for borrowing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input id="quantity" type="number" min={1} max={500} {...register("quantity")} />
                <p className="text-[10px] text-foreground-muted">Each unit receives a unique asset code and QR label.</p>
                <FieldError message={errors.quantity?.message} />
              </div>
              {editing ? (
                <div className="rounded-md border border-warning bg-warning-faint p-2.5 text-[10px] leading-4 text-warning-foreground">
                  Quantity cannot be reduced below units currently borrowed, damaged or under maintenance.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Calibration</CardTitle>
              <CardDescription>Schedule periodic calibration if required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start gap-2.5 rounded-md border border-border p-3">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border text-foreground focus:ring-foreground" {...register("calibration_required")} />
                <span>
                  <span className="block text-[12.5px] font-medium text-foreground">Calibration required</span>
                  <span className="block text-[11px] text-foreground-muted">Track due dates and generate reminders.</span>
                </span>
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="last_calibration_date">Last calibration</Label>
                <Input id="last_calibration_date" type="date" {...register("last_calibration_date")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="next_calibration_date">Next calibration due</Label>
                <Input id="next_calibration_date" type="date" {...register("next_calibration_date")} />
                <FieldError message={errors.next_calibration_date?.message} />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" disabled={isSubmitting || mutation.isPending}>
              {isSubmitting || mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing ? "Save changes" : "Register equipment"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(editing ? `/equipment/${equipmentId}` : "/equipment")}>
              <ArrowLeft className="h-4 w-4" /> Cancel
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}