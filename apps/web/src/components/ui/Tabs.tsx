"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";

import { classNames } from "./class-names";

type TabsVariant = "underline" | "segmented";
type TabsOrientation = "horizontal" | "vertical";

type TabsContextValue = {
  baseId: string;
  onValueChange: (value: string) => void;
  orientation: TabsOrientation;
  value: string;
  variant: TabsVariant;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const context = useContext(TabsContext);

  if (!context) {
    throw new Error("Tabs components must be rendered inside <Tabs>.");
  }

  return context;
}

function valueId(value: string): string {
  return encodeURIComponent(value).replaceAll("%", "-");
}

export type TabsProps = HTMLAttributes<HTMLDivElement> & {
  onValueChange: (value: string) => void;
  orientation?: TabsOrientation;
  value: string;
  variant?: TabsVariant;
};

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  {
    children,
    className,
    onValueChange,
    orientation = "horizontal",
    value,
    variant = "underline",
    ...props
  },
  ref,
) {
  const baseId = useId();

  return (
    <TabsContext.Provider value={{ baseId, onValueChange, orientation, value, variant }}>
      <div
        ref={ref}
        className={classNames("w-full", className)}
        data-orientation={orientation}
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
});

export type TabListProps = HTMLAttributes<HTMLDivElement> & {
  "aria-label": string;
};

export const TabList = forwardRef<HTMLDivElement, TabListProps>(function TabList(
  { className, ...props },
  ref,
) {
  const { orientation, variant } = useTabsContext();

  return (
    <div
      {...props}
      ref={ref}
      role="tablist"
      aria-orientation={orientation}
      className={classNames(
        "flex",
        orientation === "vertical" && "flex-col",
        variant === "underline" && "border-b border-border-subtle",
        variant === "segmented" && "w-fit gap-1 rounded-lg border border-border bg-surface p-1",
        className,
      )}
    />
  );
});

export type TabProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> & {
  value: string;
};

export const Tab = forwardRef<HTMLButtonElement, TabProps>(function Tab(
  { children, className, disabled, onClick, onKeyDown, value, ...props },
  ref,
) {
  const context = useTabsContext();
  const selected = context.value === value;
  const idPart = valueId(value);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    onKeyDown?.(event);

    if (event.defaultPrevented) return;

    const list = event.currentTarget.closest('[role="tablist"]');
    const tabs = list
      ? Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
      : [];
    const currentIndex = tabs.indexOf(event.currentTarget);
    const previousKey = context.orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const nextKey = context.orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
    let nextIndex: number | undefined;

    if (event.key === previousKey) nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === nextKey) nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;

    if (nextIndex === undefined || currentIndex < 0 || tabs.length === 0) return;

    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  }

  return (
    <button
      {...props}
      ref={ref}
      type="button"
      role="tab"
      id={`${context.baseId}-tab-${idPart}`}
      aria-controls={`${context.baseId}-panel-${idPart}`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      className={classNames(
        "relative inline-flex min-h-10 items-center justify-center px-4 text-sm font-medium transition-colors",
        "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        context.variant === "underline" &&
          (selected
            ? "text-brand after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-brand"
            : "text-foreground-muted hover:text-foreground"),
        context.variant === "segmented" &&
          (selected
            ? "rounded-md bg-surface-selected text-brand"
            : "rounded-md text-foreground-muted hover:bg-surface-hover hover:text-foreground"),
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.onValueChange(value);
      }}
      onKeyDown={handleKeyDown}
    >
      {children}
    </button>
  );
});

export type TabPanelProps = HTMLAttributes<HTMLDivElement> & {
  value: string;
};

export const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(function TabPanel(
  { children, className, value, ...props },
  ref,
) {
  const context = useTabsContext();
  const selected = context.value === value;
  const idPart = valueId(value);

  return (
    <div
      {...props}
      ref={ref}
      role="tabpanel"
      id={`${context.baseId}-panel-${idPart}`}
      aria-labelledby={`${context.baseId}-tab-${idPart}`}
      tabIndex={0}
      hidden={!selected}
      className={classNames(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        className,
      )}
    >
      {children}
    </div>
  );
});
