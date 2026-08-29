import { forwardRef, type HTMLAttributes } from "react";

import { classNames } from "../ui/class-names";

type ColumnCount = 1 | 2 | 3 | 4;

const baseColumnClasses: Record<ColumnCount, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

const smallColumnClasses: Record<ColumnCount, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

const largeColumnClasses: Record<ColumnCount, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

const gapClasses = {
  none: "gap-0",
  sm: "gap-2 sm:gap-3",
  md: "gap-4 sm:gap-5",
  lg: "gap-5 sm:gap-6 lg:gap-8",
} as const;

export type ResponsiveGridProps = HTMLAttributes<HTMLDivElement> & {
  columns?: ColumnCount;
  columnsAtLg?: ColumnCount;
  columnsAtSm?: ColumnCount;
  gap?: keyof typeof gapClasses;
};

export const ResponsiveGrid = forwardRef<HTMLDivElement, ResponsiveGridProps>(
  function ResponsiveGrid(
    { className, columns = 1, columnsAtLg, columnsAtSm, gap = "md", ...props },
    ref,
  ) {
    return (
      <div
        {...props}
        ref={ref}
        className={classNames(
          "grid min-w-0 [&>*]:min-w-0",
          baseColumnClasses[columns],
          columnsAtSm ? smallColumnClasses[columnsAtSm] : undefined,
          columnsAtLg ? largeColumnClasses[columnsAtLg] : undefined,
          gapClasses[gap],
          className,
        )}
      />
    );
  },
);
