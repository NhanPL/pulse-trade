import { forwardRef, type ButtonHTMLAttributes } from "react";

import { classNames } from "./class-names";

const variantClasses = {
  primary:
    "bg-brand text-foreground-inverse shadow-brand hover:bg-brand-hover active:bg-brand-active",
  secondary:
    "border border-border bg-surface-interactive text-foreground hover:border-border-strong hover:bg-surface-hover active:bg-surface-selected",
  ghost: "text-foreground-secondary hover:bg-surface-hover hover:text-foreground",
  positive: "bg-positive text-foreground-inverse hover:brightness-110 active:brightness-95",
  destructive: "bg-negative text-foreground hover:brightness-110 active:brightness-95",
} as const;

const sizeClasses = {
  sm: "h-8 gap-1.5 rounded-md px-3 text-xs",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
  lg: "h-12 gap-2.5 rounded-lg px-6 text-base",
  icon: "size-10 rounded-lg",
} as const;

export type ButtonVariant = keyof typeof variantClasses;
export type ButtonSize = keyof typeof sizeClasses;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    isLoading = false,
    size = "md",
    type = "button",
    variant = "primary",
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={classNames(
        "inline-flex shrink-0 items-center justify-center font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
        />
      ) : null}
      {children}
    </button>
  );
});
