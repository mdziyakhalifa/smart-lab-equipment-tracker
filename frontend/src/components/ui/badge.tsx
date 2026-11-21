import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-muted-foreground",
        secondary: "border-border bg-secondary text-secondary-foreground",
        destructive: "border-danger bg-danger-background text-danger",
        outline: "border-border text-foreground",
        success: "border-success bg-success-background text-success",
        warning: "border-warning bg-warning-background text-warning",
        danger: "border-danger bg-danger-background text-danger",
        muted: "border-border bg-muted text-muted-foreground",
        info: "border-primary/30 bg-primary/10 text-primary",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
