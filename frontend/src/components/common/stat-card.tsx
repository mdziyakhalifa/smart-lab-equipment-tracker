import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatCardTone =
  | "navy"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "slate"
  | "primary"
  | "warning"
  | "danger"
  | "success";

export interface StatCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon?: LucideIcon;
  tone?: StatCardTone;
}

const tones: Record<string, string> = {
  navy: "bg-primary/10 text-primary border border-primary/20",
  blue: "bg-secondary/15 text-secondary border border-secondary/25",
  green: "bg-success-background text-success border border-success/25",
  amber: "bg-warning-background text-warning border border-warning/25",
  red: "bg-danger-background text-danger border border-danger/25",
  slate: "bg-muted text-muted-foreground border border-border",
  primary: "bg-primary/10 text-primary border border-primary/20",
  warning: "bg-warning-background text-warning border border-warning/25",
  danger: "bg-danger-background text-danger border border-danger/25",
  success: "bg-success-background text-success border border-success/25",
};

export function StatCard({ title, value, description, icon: Icon, tone = "navy" }: StatCardProps) {
  const toneStyle = tones[tone] || tones.navy;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card transition-all hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-muted-foreground">{title}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {description ? <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p> : null}
        </div>
        {Icon ? (
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", toneStyle)}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
