"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { classNames } from "./class-names";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  description?: string;
  error?: string;
  label?: string;
  leadingIcon?: ReactNode;
  trailingElement?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    className,
    description,
    disabled,
    error,
    id,
    label,
    leadingIcon,
    required,
    trailingElement,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [ariaDescribedBy, descriptionId, errorId].filter(Boolean).join(" ");

  return (
    <div className="grid gap-1.5">
      {label ? (
        <label className="text-sm font-medium text-foreground" htmlFor={inputId}>
          {label}
          {required ? <span className="ml-1 text-negative">*</span> : null}
        </label>
      ) : null}

      <div className="relative flex items-center">
        {leadingIcon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 flex text-foreground-muted"
          >
            {leadingIcon}
          </span>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          className={classNames(
            "h-11 w-full rounded-lg border bg-surface-interactive px-3 text-sm text-foreground outline-none transition-colors",
            "border-border placeholder:text-foreground-muted hover:border-border-strong",
            "focus:border-brand focus:ring-2 focus:ring-focus/25",
            "disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-disabled disabled:opacity-70",
            Boolean(leadingIcon) && "pl-10",
            Boolean(trailingElement) && "pr-10",
            error && "border-negative focus:border-negative focus:ring-negative/25",
            className,
          )}
          disabled={disabled}
          required={required}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : ariaInvalid}
          {...props}
        />

        {trailingElement ? (
          <span className="absolute right-3 flex text-foreground-muted">{trailingElement}</span>
        ) : null}
      </div>

      {description ? (
        <p id={descriptionId} className="text-xs text-foreground-muted">
          {description}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-xs text-negative" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
