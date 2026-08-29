import { forwardRef, type HTMLAttributes } from "react";

import { classNames } from "./class-names";

const variantClasses = {
  neutral: "border-border bg-surface-interactive text-foreground-secondary",
  brand: "border-brand/35 bg-brand-subtle text-brand",
  positive: "border-positive/35 bg-positive-subtle text-positive",
  negative: "border-negative/35 bg-negative-subtle text-negative",
  warning: "border-warning/35 bg-warning-subtle text-warning",
  info: "border-info/35 bg-info-subtle text-info",
} as const;

const dotClasses = {
  neutral: "bg-foreground-muted",
  brand: "bg-brand",
  positive: "bg-positive",
  negative: "bg-negative",
  warning: "bg-warning",
  info: "bg-info",
} as const;

export type BadgeVariant = keyof typeof variantClasses;

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  showDot?: boolean;
  variant?: BadgeVariant;
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { children, className, showDot = false, variant = "neutral", ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={classNames(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {showDot ? (
        <span
          aria-hidden="true"
          className={classNames("size-1.5 rounded-full", dotClasses[variant])}
        />
      ) : null}
      {children}
    </span>
  );
});
