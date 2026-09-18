"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { marketOrderRequestSchema, type MarketOrderRequest } from "@pulse-trade/contracts";
import { useId, useRef, useState, type FormEvent } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { classNames } from "@/components/ui/class-names";
import { Input } from "@/components/ui/Input";
import { useAuthSession } from "@/features/auth/components/AuthSessionProvider";
import { formatMarketPrice } from "@/lib/format/market-value";
import { MarketOrderSubmissionError, submitMarketOrder } from "../../api/market-order";

type OrderSide = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT";
type MarketOrderFormValues = Pick<MarketOrderRequest, "quantity">;

const marketOrderFormSchema = marketOrderRequestSchema.pick({ quantity: true });

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
  disabled?: boolean;
  label: string;
  name: string;
  onChange: (value: TValue) => void;
  options: readonly SegmentedOption<TValue>[];
  value: TValue;
};

function SegmentedControl<TValue extends string>({
  disabled = false,
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
                "relative flex min-h-10 cursor-pointer items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors lg:min-h-9 disabled:cursor-not-allowed disabled:opacity-50",
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
                disabled={disabled}
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
  disabled?: boolean;
  idPrefix: string;
  onChange: (side: OrderSide) => void;
  side: OrderSide;
};

function BuySellTabs({ controlsId, disabled = false, idPrefix, onChange, side }: BuySellTabsProps) {
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
              "relative min-h-12 border-b-2 px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
              selected
                ? option.value === "BUY"
                  ? "border-positive bg-positive-subtle/35 text-positive"
                  : "border-negative bg-negative-subtle/35 text-negative"
                : "border-transparent text-foreground-muted hover:bg-surface-hover hover:text-foreground",
            )}
            id={`${idPrefix}-${option.value.toLowerCase()}-tab`}
            disabled={disabled}
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
  const queryClient = useQueryClient();
  const auth = useAuthSession();
  const formId = useId();
  const submitting = useRef(false);
  const [side, setSide] = useState<OrderSide>("BUY");
  const [type, setType] = useState<OrderType>("LIMIT");
  const [limitPrice, setLimitPrice] = useState(currentPrice);
  const [filledOrder, setFilledOrder] = useState<{
    price: string;
    side: OrderSide;
  } | null>(null);
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<MarketOrderFormValues>({
    defaultValues: { quantity: "" },
    resolver: zodResolver(marketOrderFormSchema),
  });
  const marketOrder = useMutation({
    mutationFn: submitMarketOrder,
    onSuccess: () => {
      // These queries are introduced in later epics; invalidation avoids stale balances/order history.
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
  const quantity = useWatch({ control, name: "quantity" });
  const pending = isSubmitting || marketOrder.isPending;
  const estimatePrice = type === "MARKET" ? currentPrice : limitPrice;
  const reservesBaseAsset = type === "LIMIT" && side === "SELL";
  const estimateLabel = type === "LIMIT" ? "Estimated reserved" : "Estimated notional";
  const estimate = reservesBaseAsset
    ? formatQuantityEstimate(quantity, baseAsset)
    : formatEstimate(quantity, estimatePrice, quoteAsset);
  const orderFieldsId = `${formId}-order-fields`;

  function handleFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (auth.status === "checking") return;
    if (auth.status !== "authenticated") {
      router.push(`/login?returnTo=${encodeURIComponent(`/trade/${symbol}`)}`);
      return;
    }
    if (type === "LIMIT") {
      setError("root", { message: "Limit order placement is not available yet." });
      return;
    }
    void handleSubmit(submitMarketOrderForm)(event);
  }

  async function submitMarketOrderForm(values: MarketOrderFormValues): Promise<void> {
    if (submitting.current) return;

    const accessToken = auth.getAccessToken();
    if (!accessToken) {
      setError("root", {
        message: "Your sign-in session has expired. Sign in again to place an order.",
      });
      return;
    }

    submitting.current = true;
    clearErrors("root");
    setFilledOrder(null);
    try {
      const filled = await marketOrder.mutateAsync({
        accessToken,
        quantity: values.quantity,
        side,
        symbol,
        type: "MARKET",
      });
      reset({ quantity: "" });
      setFilledOrder({ price: filled.avgFillPrice, side: filled.side });
    } catch (error) {
      setError("root", {
        message:
          error instanceof MarketOrderSubmissionError
            ? error.message
            : "Order placement is temporarily unavailable. Check your connection and try again.",
      });
    } finally {
      submitting.current = false;
    }
  }

  const isGuest = auth.status !== "authenticated";
  const limitOrderUnavailable = auth.status === "authenticated" && type === "LIMIT";
  const buttonLabel =
    auth.status === "checking"
      ? "Checking session…"
      : isGuest
        ? `Sign in to ${side === "BUY" ? "buy" : "sell"} ${baseAsset}`
        : limitOrderUnavailable
          ? "Limit orders coming soon"
          : `${side === "BUY" ? "Buy" : "Sell"} ${baseAsset}`;

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-panel"
    >
      <header className="flex min-h-12 items-stretch justify-between border-b border-border-subtle pr-4">
        <h2 id={`${formId}-title`} className="sr-only">
          Place {symbol} paper order
        </h2>
        <BuySellTabs
          controlsId={orderFieldsId}
          disabled={pending}
          idPrefix={formId}
          onChange={setSide}
          side={side}
        />
        <p className="hidden self-center text-right text-xs text-foreground-muted sm:block">
          Available / locked
          <span className="block font-medium text-foreground-secondary">
            {isGuest ? "Sign in to view" : "View in Portfolio"}
          </span>
        </p>
      </header>

      <form
        aria-labelledby={`${formId}-${side.toLowerCase()}-tab`}
        aria-busy={pending}
        className="grid min-h-0 gap-5 p-4 sm:p-5 lg:flex-1 lg:content-start lg:gap-3 lg:overflow-y-auto lg:p-4"
        id={orderFieldsId}
        noValidate
        onSubmit={handleFormSubmit}
        role="tabpanel"
      >
        <SegmentedControl
          disabled={pending}
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
              readOnly={pending}
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
            placeholder="0.00"
            readOnly={pending}
            step="0.00000001"
            trailingElement={<span className="text-xs font-semibold">{baseAsset}</span>}
            type="number"
            value={quantity}
            error={errors.quantity ? "Enter a positive fixed-point quantity." : undefined}
            {...register("quantity")}
          />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border-subtle pt-4 lg:pt-3">
          <span className="text-sm text-foreground-muted">{estimateLabel}</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {estimate}
          </span>
        </div>

        {errors.root?.message ? (
          <p
            className="rounded-lg border border-negative/30 bg-negative-subtle p-3 text-sm text-negative"
            role="alert"
          >
            {errors.root.message}
          </p>
        ) : null}

        {filledOrder ? (
          <p
            className="rounded-lg border border-positive/30 bg-positive-subtle p-3 text-sm text-positive"
            role="status"
          >
            Market {filledOrder.side} order filled at {formatMarketPrice(filledOrder.price)}{" "}
            {quoteAsset}.
          </p>
        ) : null}

        <Button
          className="w-full lg:sticky lg:bottom-0 lg:z-10"
          disabled={auth.status === "checking" || limitOrderUnavailable}
          isLoading={pending}
          size="lg"
          type="submit"
          variant={side === "BUY" ? "positive" : "destructive"}
        >
          {pending ? `${side === "BUY" ? "Buying" : "Selling"}…` : buttonLabel}
        </Button>

        <p className="text-center text-xs leading-5 text-foreground-muted lg:sr-only">
          Paper trading only. Estimates use the displayed price; execution price and balances are
          validated by the server.
        </p>
      </form>
    </section>
  );
}
