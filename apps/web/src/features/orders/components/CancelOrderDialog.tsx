"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OrderListItem } from "@pulse-trade/contracts";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuthSession } from "@/features/auth/components/AuthSessionProvider";
import { portfolioQueryKeys } from "@/features/portfolio/model/query-keys";
import { formatMarketPrice } from "@/lib/format/market-value";

import { cancelOrder, OrdersRequestError } from "../api/orders";
import { ordersQueryKeys } from "../model/query-keys";

type CancelOrderDialogProps = {
  onDismiss: () => void;
  onSuccess: () => void;
  order: OrderListItem;
  returnFocusRef: RefObject<HTMLElement | null>;
};

function isTerminalCancellationError(error: unknown): error is OrdersRequestError {
  return (
    error instanceof OrdersRequestError &&
    (error.code === "ORDER_NOT_CANCELLABLE" || error.code === "ORDER_NOT_FOUND")
  );
}

export function CancelOrderDialog({
  onDismiss,
  onSuccess,
  order,
  returnFocusRef,
}: CancelOrderDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const queryClient = useQueryClient();
  const session = useAuthSession();
  const submitting = useRef(false);
  const dismissButton = useRef<HTMLButtonElement>(null);

  function refreshTradingState() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: portfolioQueryKeys.all }),
    ]);
  }

  const cancellation = useMutation({
    retry: false,
    mutationFn: () => {
      const accessToken = session.getAccessToken();
      if (!accessToken) {
        throw new OrdersRequestError(
          "UNAUTHENTICATED",
          "Your session has expired. Sign in again to continue.",
        );
      }
      return cancelOrder(accessToken, order.id);
    },
    onSuccess: async () => {
      await refreshTradingState();
      onSuccess();
    },
    onError: (error) => {
      if (isTerminalCancellationError(error)) {
        // A fill or another cancellation won the race; only the server can reconcile balances.
        // Refresh in the background so REST retries cannot delay the conflict message or dismissal.
        void refreshTradingState();
      }
    },
    onSettled: () => {
      submitting.current = false;
    },
  });
  const terminalError = isTerminalCancellationError(cancellation.error) ? cancellation.error : null;
  const cannotCancel = terminalError !== null;

  useEffect(() => {
    // The confirmation action disappears after a conflict, so keep focus inside the dialog.
    if (cannotCancel) dismissButton.current?.focus();
  }, [cannotCancel]);

  function confirmCancellation(): void {
    if (cannotCancel || submitting.current || order.type !== "LIMIT" || order.status !== "PENDING")
      return;
    submitting.current = true;
    cancellation.mutate();
  }

  return (
    <Modal
      describedBy={descriptionId}
      dismissDisabled={cancellation.isPending}
      labelledBy={titleId}
      onDismiss={onDismiss}
      returnFocusRef={returnFocusRef}
    >
      <header className="border-b border-border-subtle p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold" id={titleId}>
            Cancel Order
          </h2>
          <Button
            aria-label="Close cancellation dialog"
            disabled={cancellation.isPending}
            onClick={onDismiss}
            size="icon"
            variant="ghost"
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>
        <p className="mt-1 text-sm text-foreground-secondary" id={descriptionId}>
          {cannotCancel ? (
            <>
              Cancellation is no longer available for this {order.symbol} limit {order.side}.
            </>
          ) : (
            <>
              Cancel this {order.symbol} limit {order.side}? Reserved{" "}
              {order.side === "BUY" ? "funds" : "assets"} will be released.
            </>
          )}
        </p>
      </header>
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{order.symbol.replace("-", " / ")}</p>
            <p className="mt-1 text-sm text-foreground-muted">{order.side} Limit Order</p>
          </div>
          <Badge className="shrink-0" showDot variant="warning">
            {cannotCancel
              ? terminalError?.code === "ORDER_NOT_FOUND"
                ? "Unavailable"
                : "No longer pending"
              : "Pending"}
          </Badge>
        </div>
        <dl className="space-y-3 border-t border-border-subtle pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-foreground-muted">Quantity</dt>
            <dd className="font-mono tabular-nums">
              {order.quantity} {order.symbol.split("-")[0]}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-foreground-muted">Limit Price</dt>
            <dd className="font-mono tabular-nums">
              {order.limitPrice ? formatMarketPrice(order.limitPrice) : "—"}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-foreground-muted">Order ID</dt>
            <dd className="break-all font-mono text-xs">{order.id}</dd>
          </div>
        </dl>
        {!cannotCancel ? (
          <p className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-3 text-sm text-warning">
            This action cannot be undone.
          </p>
        ) : null}
        {cancellation.isError ? (
          <p className={`text-sm ${cannotCancel ? "text-warning" : "text-negative"}`} role="alert">
            {cancellation.error instanceof OrdersRequestError
              ? cancellation.error.message
              : "Cancellation is unavailable. Please try again later."}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            disabled={cancellation.isPending}
            onClick={onDismiss}
            ref={dismissButton}
            variant="secondary"
          >
            {cannotCancel ? "Close" : "No, Keep Order"}
          </Button>
          {!cannotCancel ? (
            <Button
              isLoading={cancellation.isPending}
              onClick={confirmCancellation}
              variant="destructive"
            >
              {cancellation.isPending ? "Cancelling…" : "Yes, Cancel Order"}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
