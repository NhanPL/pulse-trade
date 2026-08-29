import { forwardRef, type HTMLAttributes } from "react";

import { classNames } from "./class-names";

const variantClasses = {
  text: "h-4 w-full rounded-sm",
  rectangular: "min-h-20 w-full rounded-lg",
  circular: "size-10 rounded-full",
} as const;

export type SkeletonVariant = keyof typeof variantClasses;

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  variant?: SkeletonVariant;
};

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, variant = "rectangular", ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      aria-hidden="true"
      className={classNames(
        "animate-pulse bg-surface-hover motion-reduce:animate-none",
        variantClasses[variant],
        className,
      )}
    />
  );
});
