import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  backTo?: string;
  eyebrow?: string;
}

export function PageHeader({ title, description, actions, backTo, eyebrow }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {backTo ? (
          <Link to={backTo} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        ) : null}
        {eyebrow ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="text-[20px] font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
