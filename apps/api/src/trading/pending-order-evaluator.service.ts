import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
  type ProviderMarketEvent,
  type ProviderTickerEvent,
} from "../markets/provider/market-data-provider";
import { SUPPORTED_MARKET_SYMBOLS } from "../markets/supported-markets";
import { SubscriptionRegistry } from "../realtime/subscription-registry.service";
import { TradingDomainError, compareDecimals, requirePositiveDecimal } from "./domain/decimal";

export const PENDING_ORDER_EVALUATION_BATCH_SIZE = 100;
export const PENDING_ORDER_EVALUATION_INTERVAL_MS = 100;
export const PENDING_ORDER_EVALUATOR_OPTIONS = Symbol("PENDING_ORDER_EVALUATOR_OPTIONS");

export type PendingOrderEvaluatorOptions = Readonly<{
  evaluationIntervalMs?: number;
  now?: () => number;
}>;

export type EligibleLimitOrder = Readonly<{
  limitPrice: string;
  marketPrice: string;
  marketTs: number;
  orderId: string;
  side: "BUY" | "SELL";
  symbol: string;
}>;

export type EligibleLimitOrderListener = (order: EligibleLimitOrder) => Promise<void> | void;

type TickerVersion = Readonly<{
  marketTs: number;
  providerSequence: number;
}>;

@Injectable()
export class PendingOrderEvaluator implements OnModuleInit, OnModuleDestroy {
  private readonly activeSymbols = new Set<string>();
  private destroyed = false;
  private readonly evaluationIntervalMs: number;
  private readonly evaluationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastEvaluationStartedAt = new Map<string, number>();
  private readonly latestTickerVersions = new Map<string, TickerVersion>();
  private readonly listeners = new Set<EligibleLimitOrderListener>();
  private readonly logger = new Logger(PendingOrderEvaluator.name);
  private readonly now: () => number;
  private readonly pendingTickers = new Map<string, ProviderTickerEvent>();
  private releaseTickerSubscription: (() => void) | undefined;
  private removeProviderListener: (() => void) | undefined;

  constructor(
    @Inject(MARKET_DATA_PROVIDER)
    private readonly provider: MarketDataProvider,
    private readonly prisma: PrismaService,
    private readonly subscriptionRegistry: SubscriptionRegistry,
    @Optional()
    @Inject(PENDING_ORDER_EVALUATOR_OPTIONS)
    options: PendingOrderEvaluatorOptions = {},
  ) {
    this.evaluationIntervalMs =
      options.evaluationIntervalMs ?? PENDING_ORDER_EVALUATION_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    if (!Number.isFinite(this.evaluationIntervalMs) || this.evaluationIntervalMs < 0) {
      throw new Error("Pending-order evaluation interval must be a non-negative finite number.");
    }
  }

  onModuleInit(): void {
    if (this.removeProviderListener) return;

    this.destroyed = false;
    const removeProviderListener = this.provider.onEvent((event) => this.handleMarketEvent(event));
    try {
      const releaseTickerSubscription = this.subscriptionRegistry.retainProviderSubscription({
        channels: ["ticker"],
        symbols: SUPPORTED_MARKET_SYMBOLS,
      });
      this.removeProviderListener = removeProviderListener;
      this.releaseTickerSubscription = releaseTickerSubscription;
    } catch (error) {
      removeProviderListener();
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.removeProviderListener?.();
    this.removeProviderListener = undefined;

    try {
      this.releaseTickerSubscription?.();
    } catch {
      this.logger.warn("Failed to release the pending-order ticker subscription cleanly");
    }
    this.releaseTickerSubscription = undefined;
    for (const timer of this.evaluationTimers.values()) clearTimeout(timer);
    this.evaluationTimers.clear();
    this.pendingTickers.clear();
    this.latestTickerVersions.clear();
    this.lastEvaluationStartedAt.clear();
    this.listeners.clear();
  }

  onEligibleOrder(listener: EligibleLimitOrderListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async evaluateTicker(event: ProviderTickerEvent): Promise<readonly EligibleLimitOrder[]> {
    let marketPrice: string;
    try {
      marketPrice = requirePositiveDecimal(event.price, "market price");
    } catch (error) {
      if (error instanceof TradingDomainError) return [];
      throw error;
    }

    const orders = await this.prisma.client.order.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, limitPrice: true, side: true, symbol: true },
      take: PENDING_ORDER_EVALUATION_BATCH_SIZE,
      where: {
        OR: [
          { limitPrice: { gte: marketPrice }, side: "BUY" },
          { limitPrice: { lte: marketPrice }, side: "SELL" },
        ],
        status: "PENDING",
        symbol: event.symbol,
        type: "LIMIT",
      },
    });

    const eligibleOrders: EligibleLimitOrder[] = [];
    for (const order of orders) {
      if (!order.limitPrice) continue;
      const limitPrice = order.limitPrice.toString();
      if (!isLimitOrderEligible(order.side, marketPrice, limitPrice)) continue;

      eligibleOrders.push({
        limitPrice,
        marketPrice,
        marketTs: event.marketTs,
        orderId: order.id,
        side: order.side,
        symbol: order.symbol,
      });
    }

    for (const order of eligibleOrders) {
      if (this.destroyed) break;
      await this.emitEligibleOrder(order);
    }
    return eligibleOrders;
  }

  private async drainSymbol(symbol: string): Promise<void> {
    try {
      while (!this.destroyed) {
        const ticker = this.pendingTickers.get(symbol);
        if (!ticker) break;
        this.pendingTickers.delete(symbol);

        try {
          await this.evaluateTicker(ticker);
        } catch {
          this.logger.warn(`Unable to evaluate pending orders for ${symbol}`);
        }
      }
    } finally {
      this.activeSymbols.delete(symbol);
      if (!this.destroyed && this.pendingTickers.has(symbol)) this.scheduleDrain(symbol);
    }
  }

  private async emitEligibleOrder(order: EligibleLimitOrder): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(order);
      } catch {
        this.logger.warn(`Eligible order listener failed for order ${order.orderId}`);
      }
    }
  }

  private handleMarketEvent(event: ProviderMarketEvent): void {
    if (this.destroyed || event.type !== "ticker") return;

    const previousVersion = this.latestTickerVersions.get(event.symbol);
    if (previousVersion && !isNewerTicker(event, previousVersion)) return;

    this.latestTickerVersions.set(event.symbol, {
      marketTs: event.marketTs,
      providerSequence: event.providerSequence,
    });
    this.pendingTickers.set(event.symbol, event);
    this.scheduleDrain(event.symbol);
  }

  private scheduleDrain(symbol: string): void {
    if (this.activeSymbols.has(symbol) || this.evaluationTimers.has(symbol)) return;

    const elapsed = this.now() - (this.lastEvaluationStartedAt.get(symbol) ?? -Infinity);
    const delay = Math.max(0, this.evaluationIntervalMs - elapsed);
    if (delay > 0) {
      // Preserve only the newest ticker while bounding database evaluation cadence per symbol.
      const timer = setTimeout(() => {
        this.evaluationTimers.delete(symbol);
        this.startDrain(symbol);
      }, delay);
      timer.unref();
      this.evaluationTimers.set(symbol, timer);
      return;
    }

    this.startDrain(symbol);
  }

  private startDrain(symbol: string): void {
    if (this.destroyed || this.activeSymbols.has(symbol)) return;
    this.lastEvaluationStartedAt.set(symbol, this.now());
    this.activeSymbols.add(symbol);
    void this.drainSymbol(symbol);
  }
}

export function isLimitOrderEligible(
  side: "BUY" | "SELL",
  marketPrice: string,
  limitPrice: string,
): boolean {
  try {
    const comparison = compareDecimals(
      requirePositiveDecimal(marketPrice, "market price"),
      requirePositiveDecimal(limitPrice, "limit price"),
    );
    return side === "BUY" ? comparison <= 0 : comparison >= 0;
  } catch (error) {
    if (error instanceof TradingDomainError) return false;
    throw error;
  }
}

function isNewerTicker(candidate: ProviderTickerEvent, previous: TickerVersion): boolean {
  if (candidate.marketTs !== previous.marketTs) return candidate.marketTs > previous.marketTs;
  return candidate.providerSequence > previous.providerSequence;
}
