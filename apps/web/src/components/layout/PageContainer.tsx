import type { HTMLAttributes } from "react";

import { classNames } from "../ui/class-names";

const widthClasses = {
  narrow: "max-w-xl",
  content: "max-w-7xl",
  wide: "max-w-[1440px]",
  full: "max-w-none",
} as const;

const spacingClasses = {
  none: "",
  compact: "px-4 py-4 sm:px-6 lg:px-8",
  default: "px-4 py-6 sm:px-6 sm:py-8 lg:px-8",
  spacious: "px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12",
} as const;

export type PageContainerWidth = keyof typeof widthClasses;
export type PageContainerSpacing = keyof typeof spacingClasses;

export type PageContainerProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "main" | "section";
  spacing?: PageContainerSpacing;
  width?: PageContainerWidth;
};

export function PageContainer({
  as: Component = "main",
  className,
  spacing = "default",
  width = "wide",
  ...props
}: PageContainerProps) {
  return (
    <Component
      {...props}
      className={classNames(
        "mx-auto w-full",
        widthClasses[width],
        spacingClasses[spacing],
        className,
      )}
    />
  );
}
