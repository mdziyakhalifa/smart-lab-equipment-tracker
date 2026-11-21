import * as React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  required?: boolean;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, defaultChecked, onCheckedChange, onChange, required, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(event.target.checked);
      onChange?.(event);
    };

    return (
      <span className={cn("inline-flex items-center justify-center cursor-pointer rounded-full border border-border bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input", className)}>
        <input
          type="checkbox"
          checked={checked}
          defaultChecked={defaultChecked}
          onChange={handleChange}
          required={required}
          ref={ref}
          className="sr-only peer"
          data-state={checked ? "checked" : "unchecked"}
          {...props}
        />
        <span
          className={cn(
            "translate-x-[-2px] data-[state=checked]:translate-x-full box-border border border-border rounded-full bg-card h-4 w-4 shrink-0 transition-all data-[state=checked]:border-primary",
            checked ? "translate-x-full" : "translate-x-[-2px]",
          )}
        />
      </span>
    );
  },
);
Switch.displayName = "Switch";

export { Switch };
