import { Badge, type BadgeProps } from "@/components/ui/badge";
import { humanize } from "@/lib/utils";

const variants: Record<string, BadgeProps["variant"]> = {
  available: "success",
  partially_available: "warning",
  borrowed: "secondary",
  reserved: "secondary",
  under_maintenance: "warning",
  damaged: "danger",
  retired: "muted",
  pending: "warning",
  approved: "secondary",
  rejected: "danger",
  issued: "secondary",
  return_requested: "warning",
  returned: "success",
  overdue: "danger",
  due_soon: "warning",
  upcoming: "secondary",
  cancelled: "muted",
  completed: "success",
  reported: "warning",
  under_review: "secondary",
  under_repair: "warning",
  resolved: "success",
  scheduled: "secondary",
  in_progress: "warning",
  operational: "success",
  excellent: "success",
  good: "success",
  fair: "warning",
  poor: "danger",
  low: "muted",
  medium: "warning",
  high: "danger",
  critical: "danger",
  active: "success",
  inactive: "muted",
  passed: "success",
  failed: "danger",
  adjusted: "warning",
  in: "success",
  out: "warning",
  adjustment: "secondary",
};

interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  status?: string | null;
  label?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const key = status ?? "unknown";
  const variant = variants[key] ?? "default";
  return (
    <Badge variant={variant} className={className}>
      {label ?? humanize(status)}
    </Badge>
  );
}
