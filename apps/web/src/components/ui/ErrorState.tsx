import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { Button } from "./Button";
import { classNames } from "./class-names";

export type ErrorStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  action?: ReactNode;
  description?: ReactNode;
  isRetrying?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  size?: "compact" | "default";
  title: ReactNode;
};

function ErrorIcon() {
  return (
    <svg aria-hidden="true" className="size-7" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 8v5m0 3.5v.1M10.25 4.55 2.8 17.45A1.7 1.7 0 0 0 4.27 20h15.46a1.7 1.7 0 0 0 1.47-2.55L13.75 4.56a2.02 2.02 0 0 0-3.5 0Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(function ErrorState(
  {
    action,
    className,
    description,
    isRetrying = false,
    onRetry,
    retryLabel = "Try again",
    role = "alert",
    size = "default",
    title,
    ...props
  },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      role={role}
      aria-atomic="true"
      aria-live={props["aria-live"] ?? "assertive"}
      className={classNames(
        "flex w-full flex-col items-center justify-center rounded-xl border border-negative/30 bg-negative-subtle/45 text-center",
        size === "compact" ? "min-h-40 px-4 py-6" : "min-h-64 px-6 py-10",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mb-4 grid size-12 place-items-center rounded-xl border border-negative/30 bg-negative-subtle text-negative"
      >
        <ErrorIcon />
      </span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description ? (
        <div className="mt-1.5 max-w-md text-sm text-foreground-secondary">{description}</div>
      ) : null}
      {onRetry || action ? (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {onRetry ? (
            <Button isLoading={isRetrying} onClick={onRetry} variant="secondary">
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
});
