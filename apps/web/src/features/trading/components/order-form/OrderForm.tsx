"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { limitBuyOrderRequestSchema, marketOrderRequestSchema } from "@pulse-trade/contracts";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { classNames } from "@/components/ui/class-names";
import { Input } from "@/components/ui/Input";
import { useAuthSession } from "@/features/auth/components/AuthSessionProvider";
import { formatMarketPrice } from "@/lib/format/market-value";
import { CreateLimitOrderError, createLimitOrder } from "../../api/create-limit-order";
import { CreateMarketOrderError, createMarketOrder } from "../../api/create-market-order";

type OrderSide = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT";

const quantitySchema = marketOrderRequestSchema.shape.quantity;
const limitPriceContractSchema = limitBuyOrderRequestSchema.shape.limitPrice;
const limitPriceFormSchema = z.string().superRefine((value, context) => {
  if (!limitPriceContractSchema.safeParse(value).success) {
    context.addIssue({ code: "custom", message: "Enter a positive limit price." });
    return;
  }

  const [whole = "", fraction = ""] = value.split(".");
  if (whole.length > 20 || fraction.length > 18) {
    context.addIssue({
      code: "custom",
      message: "Use at most 20 whole-number digits and 18 decimal places.",
    });
  }
});
const orderFormSchema = z.discriminatedUnion("type", [
  z.object({ limitPrice: z.string(), quantity: quantitySchema, type: z.literal("MARKET") }),
  z.object({
    limitPrice: limitPriceFormSchema,
    quantity: quantitySchema,
    type: z.literal("LIMIT"),
  }),
]);
type OrderFormValues = z.infer<typeof orderFormSchema>;

export type OrderFormProps = {
  baseAsset: string;
  currentPrice: string;
  quoteAsset: string;
  symbol: string;
};

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

type OrderTypeTabsProps = {
  controlsId: string;
  disabled?: boolean;
  idPrefix: string;
  onChange: (type: OrderType) => void;
  type: OrderType;
};

function OrderTypeTabs({
  controlsId,
  disabled = false,
  idPrefix,
  onChange,
  type,
}: OrderTypeTabsProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | undefined;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + TYPE_OPTIONS.length) % TYPE_OPTIONS.length;
    }
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TYPE_OPTIONS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TYPE_OPTIONS.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]:not(:disabled)',
    );
    const nextTab = tabs?.[nextIndex];
    const nextType = TYPE_OPTIONS[nextIndex]?.value;
    if (!nextTab || !nextType) return;

    onChange(nextType);
    nextTab.focus();
  }

  return (
    <div
      aria-label="Order type"
      className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1 lg:max-w-56"
      role="tablist"
    >
      {TYPE_OPTIONS.map((option, index) => {
        const selected = option.value === type;

        return (
          <button
            key={option.value}
            aria-controls={controlsId}
            aria-selected={selected}
            className={classNames(
              "relative flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors lg:min-h-9",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              "disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "bg-surface-selected text-brand"
                : "text-foreground-muted hover:bg-surface-hover hover:text-foreground",
            )}
            disabled={disabled}
            id={`${idPrefix}-${option.value.toLowerCase()}-type-tab`}
            onClick={() => onChange(option.value)}
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
  const session = useAuthSession();
  const formId = useId();
  const [side, setSide] = useState<OrderSide>("BUY");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const {
    clearErrors,
    control,
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OrderFormValues>({
    defaultValues: { limitPrice: currentPrice, quantity: "", type: "LIMIT" },
    resolver: zodResolver(orderFormSchema),
  });
  const quantity = useWatch({ control, name: "quantity" });
  const limitPrice = useWatch({ control, name: "limitPrice" });
  const type = useWatch({ control, name: "type" });
  const estimatePrice = type === "MARKET" ? currentPrice : limitPrice;
  const reservesBaseAsset = type === "LIMIT" && side === "SELL";
  const estimateLabel = type === "LIMIT" ? "Estimated reserved" : "Estimated notional";
  const estimate = reservesBaseAsset
    ? formatQuantityEstimate(quantity, baseAsset)
    : formatEstimate(quantity, estimatePrice, quoteAsset);
  const orderFieldsId = `${formId}-order-fields`;
  const orderTypePanelId = `${formId}-order-type-panel`;
  const isAuthenticated = session.status === "authenticated";
  const checkingSession = session.status === "checking";
  const pending = isSubmitting;

  useEffect(() => () => request.current?.abort(), []);

  function clearOrderFeedback(): void {
    clearErrors();
    setSuccessMessage(null);
  }

  function routeToLogin(): void {
    router.push(`/login?returnTo=${encodeURIComponent(`/trade/${symbol}`)}`);
  }

  async function submitOrder(values: OrderFormValues): Promise<void> {
    const accessToken = session.getAccessToken();
    if (!accessToken) {
      routeToLogin();
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    clearOrderFeedback();

    try {
      if (values.type === "LIMIT") {
        const order = await createLimitOrder(
          { limitPrice: values.limitPrice, quantity: values.quantity, side, symbol, type: "LIMIT" },
          accessToken,
          controller.signal,
        );
        if (controller.signal.aborted) return;

        reset({ limitPrice: values.limitPrice, quantity: "", type: "LIMIT" });
        setSuccessMessage(
          `Limit ${order.side.toLowerCase()} order placed at ${formatMarketPrice(order.limitPrice)} ${quoteAsset}.`,
        );
        return;
      }

      const order = await createMarketOrder(
        { quantity: values.quantity, side, symbol, type: "MARKET" },
        accessToken,
        controller.signal,
      );
      if (controller.signal.aborted) return;

      reset({ limitPrice: values.limitPrice, quantity: "", type: "MARKET" });
      setSuccessMessage(
        `Market ${order.side.toLowerCase()} order filled at ${formatMarketPrice(order.avgFillPrice)} ${quoteAsset}.`,
      );
    } catch (error) {
      if (controller.signal.aborted) return;

      if (error instanceof CreateMarketOrderError && error.code === "UNAUTHENTICATED") {
        routeToLogin();
        return;
      }
      if (error instanceof CreateLimitOrderError && error.code === "UNAUTHENTICATED") {
        routeToLogin();
        return;
      }
      if (error instanceof CreateLimitOrderError && error.code === "INVALID_LIMIT_PRICE") {
        setError("limitPrice", { type: "server", message: error.message }, { shouldFocus: true });
        return;
      }
      if (error instanceof CreateLimitOrderError && error.code === "INVALID_QUANTITY") {
        setError("quantity", { type: "server", message: error.message }, { shouldFocus: true });
        return;
      }
      if (
        (error instanceof CreateMarketOrderError || error instanceof CreateLimitOrderError) &&
        error.code === "INSUFFICIENT_BALANCE"
      ) {
        const availableAsset = side === "BUY" ? quoteAsset : baseAsset;
        setError(
          "quantity",
          {
            type: "insufficient-balance",
            message: `Insufficient ${availableAsset} available to ${side === "BUY" ? "buy" : "sell"} ${baseAsset}. Reduce the quantity and try again.`,
          },
          { shouldFocus: true },
        );
        return;
      }
      setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "Order placement failed. Please try again shortly.",
      });
    } finally {
      request.current = null;
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitting.current || pending) return;
    if (checkingSession) {
      setError("root", { message: "Checking your session. Please wait a moment." });
      return;
    }
    if (!isAuthenticated) {
      routeToLogin();
      return;
    }
    submitting.current = true;
    void handleSubmit(submitOrder)(event).finally(() => {
      submitting.current = false;
    });
  }

  const submitLabel = checkingSession
    ? "Checking session…"
    : !isAuthenticated
      ? `Sign in to ${side === "BUY" ? "buy" : "sell"} ${baseAsset}`
      : pending
        ? `${side === "BUY" ? "Buying" : "Selling"} ${baseAsset}…`
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
          onChange={(value) => {
            setSide(value);
            clearOrderFeedback();
          }}
          side={side}
        />
        <p className="hidden self-center text-right text-xs text-foreground-muted sm:block">
          Available / locked
          <span className="block font-medium text-foreground-secondary">
            {isAuthenticated ? "Checked when you submit" : "Sign in to view"}
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
        <OrderTypeTabs
          controlsId={orderTypePanelId}
          disabled={pending}
          idPrefix={formId}
          onChange={(value) => {
            setValue("type", value);
            clearOrderFeedback();
          }}
          type={type}
        />

        <div
          aria-labelledby={`${formId}-${type.toLowerCase()}-type-tab`}
          className="grid gap-3 lg:grid-cols-2"
          id={orderTypePanelId}
          role="tabpanel"
          tabIndex={0}
        >
          {type === "LIMIT" ? (
            <Input
              inputMode="decimal"
              label="Limit price"
              min="0.000000000000000001"
              required
              step="0.000000000000000001"
              trailingElement={<span className="text-xs font-semibold">{quoteAsset}</span>}
              type="number"
              error={errors.limitPrice?.message}
              readOnly={pending}
              {...register("limitPrice", {
                onChange: () => {
                  clearErrors("limitPrice");
                  setSuccessMessage(null);
                },
              })}
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
            required
            step="0.00000001"
            trailingElement={<span className="text-xs font-semibold">{baseAsset}</span>}
            type="number"
            error={errors.quantity?.message}
            readOnly={pending}
            {...register("quantity", {
              onChange: () => {
                clearErrors("quantity");
                setSuccessMessage(null);
              },
            })}
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
          disabled={checkingSession}
          isLoading={pending}
          size="lg"
          type="submit"
          variant={side === "BUY" ? "positive" : "destructive"}
        >
          {submitLabel}
        </Button>

        {errors.root?.message ? (
          <p
            className="rounded-lg border border-negative/30 bg-negative-subtle p-3 text-sm text-negative"
            role="alert"
          >
            {errors.root.message}
          </p>
        ) : null}

        {successMessage ? (
          <p
            className="rounded-lg border border-positive/30 bg-positive-subtle p-3 text-sm text-positive"
            role="status"
          >
            {successMessage}
          </p>
        ) : null}

        <p className="text-center text-xs leading-5 text-foreground-muted lg:sr-only">
          Paper trading only. Estimates use the displayed price; execution price and balances are
          validated by the server.
        </p>
      </form>
    </section>
  );
}
