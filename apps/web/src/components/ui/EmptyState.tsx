import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { classNames } from "./class-names";

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  action?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  size?: "compact" | "default";
  title: ReactNode;
};

function DefaultEmptyIcon() {
  return (
    <svg aria-hidden="true" className="size-7" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
      <path
        d="m4.5 7.75 7.5 4.2 7.5-4.2M12 12v8.5"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  {
    action,
    className,
    description,
    icon = <DefaultEmptyIcon />,
    role = "status",
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
      aria-live={props["aria-live"] ?? "polite"}
      className={classNames(
        "flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/65 text-center",
        size === "compact" ? "min-h-40 px-4 py-6" : "min-h-64 px-6 py-10",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mb-4 grid size-12 place-items-center rounded-xl border border-border bg-surface-interactive text-foreground-muted"
      >
        {icon}
      </span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description ? (
        <div className="mt-1.5 max-w-md text-sm text-foreground-muted">{description}</div>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
});
