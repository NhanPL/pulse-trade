import type { KeyboardEvent } from "react";

import { classNames } from "@/components/ui/class-names";

export type MobileRealtimePanel = "order-book" | "recent-trades";

export type MobileRealtimeTabsProps = {
  controlsByValue: Record<MobileRealtimePanel, string>;
  onValueChange: (value: MobileRealtimePanel) => void;
  value: MobileRealtimePanel;
};

const OPTIONS = [
  { label: "Order book", value: "order-book" },
  { label: "Recent trades", value: "recent-trades" },
] as const;

export function MobileRealtimeTabs({
  controlsByValue,
  onValueChange,
  value,
}: MobileRealtimeTabsProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number): void {
    const lastIndex = OPTIONS.length - 1;
    let nextIndex: number | undefined;

    if (event.key === "ArrowLeft") nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    if (event.key === "ArrowRight") nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;

    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextOption = OPTIONS[nextIndex];
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');

    if (nextOption) onValueChange(nextOption.value);
    tabs?.[nextIndex]?.focus();
  }

  return (
    <div
      aria-label="Realtime market panel"
      className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1"
      role="tablist"
    >
      {OPTIONS.map((option, index) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            aria-controls={controlsByValue[option.value]}
            aria-selected={selected}
            className={classNames(
              "min-h-10 rounded-md px-3 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              selected
                ? "bg-surface-selected text-brand"
                : "text-foreground-muted hover:bg-surface-hover hover:text-foreground",
            )}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
