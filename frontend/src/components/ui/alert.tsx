import * as React from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = {
  default: "border-border bg-card text-foreground",
  info: "border-info/30 bg-info-background text-info",
  success: "border-success/30 bg-success-background text-success",
  warning: "border-warning/30 bg-warning-background text-warning",
  danger: "border-danger/30 bg-danger-background text-danger",
};

const icons = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof styles;
  title?: string;
}

export function Alert({ className, variant = "default", title, children, ...props }: AlertProps) {
  const Icon = icons[variant] || Info;
  return (
    <div className={cn("flex gap-3 rounded-md border p-3.5 text-sm", styles[variant] || styles.default, className)} {...props}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        {title ? <p className="font-semibold text-[13px]">{title}</p> : null}
        <div className="text-[13px] leading-relaxed opacity-95">{children}</div>
      </div>
    </div>
  );
}
