"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { classNames } from "@/components/ui/class-names";
import { Input } from "@/components/ui/Input";
import { formatMarketPrice } from "@/lib/format/market-value";

type OrderSide = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT";

export type OrderFormProps = {
  baseAsset: string;
  currentPrice: string;
  quoteAsset: string;
  symbol: string;
};

type SegmentedOption<TValue extends string> = {
  label: string;
  value: TValue;
};

type SegmentedControlProps<TValue extends string> = {
  label: string;
  name: string;
  onChange: (value: TValue) => void;
  options: readonly SegmentedOption<TValue>[];
  value: TValue;
};

function SegmentedControl<TValue extends string>({
  label,
  name,
  onChange,
  options,
  value,
}: SegmentedControlProps<TValue>) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1 lg:max-w-56">
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <label
              key={option.value}
              className={classNames(
                "relative flex min-h-10 cursor-pointer items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors lg:min-h-9",
                "has-focus-visible:outline-none has-focus-visible:ring-2 has-focus-visible:ring-focus",
                selected
                  ? option.value === "BUY"
                    ? "bg-positive-subtle text-positive"
                    : option.value === "SELL"
                      ? "bg-negative-subtle text-negative"
                      : "bg-surface-selected text-brand"
                  : "text-foreground-muted hover:bg-surface-hover hover:text-foreground",
              )}
            >
              <input
                checked={selected}
                className="sr-only"
                name={name}
                onChange={() => onChange(option.value)}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function formatEstimate(quantity: string, price: string, quoteAsset: string): string {
  const numericQuantity = Number(quantity);
  const numericPrice = Number(price);

  if (
    !Number.isFinite(numericQuantity) ||
    !Number.isFinite(numericPrice) ||
    numericQuantity <= 0 ||
    numericPrice <= 0
  ) {
    return `-- ${quoteAsset}`;
  }

  // This is display-only; the backend will calculate and validate authoritative order values.
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(numericQuantity * numericPrice)} ${quoteAsset}`;
}

function formatQuantityEstimate(quantity: string, baseAsset: string): string {
  const numericQuantity = Number(quantity);

  if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
    return `-- ${baseAsset}`;
  }

  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(numericQuantity)} ${baseAsset}`;
}

const SIDE_OPTIONS = [
  { label: "BUY", value: "BUY" },
  { label: "SELL", value: "SELL" },
] as const;

const TYPE_OPTIONS = [
  { label: "LIMIT", value: "LIMIT" },
  { label: "MARKET", value: "MARKET" },
] as const;

type BuySellTabsProps = {
  controlsId: string;
  idPrefix: string;
  onChange: (side: OrderSide) => void;
  side: OrderSide;
};

function BuySellTabs({ controlsId, idPrefix, onChange, side }: BuySellTabsProps) {
  return (
    <div aria-label="Order side" className="grid min-w-60 grid-cols-2 self-stretch" role="tablist">
      {SIDE_OPTIONS.map((option) => {
        const selected = option.value === side;

        return (
          <button
            key={option.value}
            aria-controls={controlsId}
            aria-selected={selected}
            className={classNames(
              "relative min-h-12 border-b-2 px-5 text-sm font-semibold transition-colors",
              "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
              selected
                ? option.value === "BUY"
                  ? "border-positive bg-positive-subtle/35 text-positive"
                  : "border-negative bg-negative-subtle/35 text-negative"
                : "border-transparent text-foreground-muted hover:bg-surface-hover hover:text-foreground",
            )}
            id={`${idPrefix}-${option.value.toLowerCase()}-tab`}
            onClick={() => onChange(option.value)}
            role="tab"
            tabIndex={0}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function OrderForm({ baseAsset, currentPrice, quoteAsset, symbol }: OrderFormProps) {
  const router = useRouter();
  const formId = useId();
  const [side, setSide] = useState<OrderSide>("BUY");
  const [type, setType] = useState<OrderType>("LIMIT");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState(currentPrice);
  const estimatePrice = type === "MARKET" ? currentPrice : limitPrice;
  const reservesBaseAsset = type === "LIMIT" && side === "SELL";
  const estimateLabel = type === "LIMIT" ? "Estimated reserved" : "Estimated notional";
  const estimate = reservesBaseAsset
    ? formatQuantityEstimate(quantity, baseAsset)
    : formatEstimate(quantity, estimatePrice, quoteAsset);
  const orderFieldsId = `${formId}-order-fields`;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    router.push(`/login?returnTo=${encodeURIComponent(`/trade/${symbol}`)}`);
  }

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-panel"
    >
      <header className="flex min-h-12 items-stretch justify-between border-b border-border-subtle pr-4">
        <h2 id={`${formId}-title`} className="sr-only">
          Place {symbol} paper order
        </h2>
        <BuySellTabs controlsId={orderFieldsId} idPrefix={formId} onChange={setSide} side={side} />
        <p className="hidden self-center text-right text-xs text-foreground-muted sm:block">
          Available / locked
          <span className="block font-medium text-foreground-secondary">Sign in to view</span>
        </p>
      </header>

      <form
        aria-labelledby={`${formId}-${side.toLowerCase()}-tab`}
        className="grid min-h-0 gap-5 p-4 sm:p-5 lg:flex-1 lg:content-start lg:gap-3 lg:overflow-y-auto lg:p-4"
        id={orderFieldsId}
        onSubmit={handleSubmit}
        role="tabpanel"
      >
        <SegmentedControl
          label="Order type"
          name={`${formId}-type`}
          onChange={setType}
          options={TYPE_OPTIONS}
          value={type}
        />

        <div className="grid gap-3 lg:grid-cols-2">
          {type === "LIMIT" ? (
            <Input
              inputMode="decimal"
              label="Limit price"
              min="0.00000001"
              name="limitPrice"
              onChange={(event) => setLimitPrice(event.target.value)}
              required
              step="0.00000001"
              trailingElement={<span className="text-xs font-semibold">{quoteAsset}</span>}
              type="number"
              value={limitPrice}
            />
          ) : (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">Indicative price</span>
              <div className="flex h-11 items-center rounded-lg border border-border-subtle bg-surface/65 px-3">
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {formatMarketPrice(currentPrice)} {quoteAsset}
                </span>
              </div>
            </div>
          )}

          <Input
            inputMode="decimal"
            label="Quantity"
            min="0.00000001"
            name="quantity"
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="0.00"
            required
            step="0.00000001"
            trailingElement={<span className="text-xs font-semibold">{baseAsset}</span>}
            type="number"
            value={quantity}
          />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border-subtle pt-4 lg:pt-3">
          <span className="text-sm text-foreground-muted">{estimateLabel}</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {estimate}
          </span>
        </div>

        <Button
          className="w-full lg:sticky lg:bottom-0 lg:z-10"
          size="lg"
          type="submit"
          variant={side === "BUY" ? "positive" : "destructive"}
        >
          Sign in to {side === "BUY" ? "buy" : "sell"} {baseAsset}
        </Button>

        <p className="text-center text-xs leading-5 text-foreground-muted lg:sr-only">
          Paper trading only. Estimates use the displayed price; execution price and balances are
          validated by the server.
        </p>
      </form>
    </section>
  );
}
