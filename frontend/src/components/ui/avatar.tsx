import * as React from "react";
import { cn, initials } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  src?: string;
  alt?: string;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, name, src, alt = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-secondary/20 text-xs font-medium text-foreground",
          className,
        )}
        {...props}
      >
        {src ? (
          <img src={src} alt={alt || name || "Avatar"} className="aspect-square h-full w-full object-cover" />
        ) : name ? (
          <span>{initials(name)}</span>
        ) : (
          children || <span>?</span>
        )}
      </div>
    );
  },
);
Avatar.displayName = "Avatar";

const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, alt = "", ...props }, ref) => (
  <img ref={ref} alt={alt} className={cn("aspect-square h-full w-full object-cover", className)} {...props} />
));
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground", className)}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };
