import { Cpu, FlaskConical, Microscope, Printer, TestTube2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  Electronics: Cpu,
  "Analytical Instruments": FlaskConical,
  Optics: Microscope,
  Biology: TestTube2,
  Fabrication: Printer,
};

export function EquipmentThumb({ category, className }: { category?: string | null; className?: string }) {
  const Icon = category ? icons[category] ?? FlaskConical : FlaskConical;
  return (
    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-warm-100 text-foreground-muted", className)}>
      <Icon className="h-5 w-5" />
    </div>
  );
}
