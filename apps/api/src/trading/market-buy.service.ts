import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { isSupportedMarketSymbol } from "../markets/supported-markets";
import { MarketCacheService } from "../realtime/market-cache.service";
import { TradingDomainError, calculateQuoteAmount, requirePositiveDecimal } from "./domain/decimal";
import { calculatePositionAfterBuy } from "./domain/position-calculations";

const MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

export type MarketBuyInput = Readonly<{
  quantity: string;
  symbol: string;
  userId: string;
}>;

export type MarketBuyExecution = Readonly<{
  executionPrice: string;
  executedAt: Date;
  orderId: string;
  quantity: string;
  quoteAmount: string;
  symbol: string;
  tradeId: string;
}>;

export type MarketBuyErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "INVALID_QUANTITY"
  | "MARKET_DATA_UNAVAILABLE"
  | "ORDER_CONFLICT"
  | "UNSUPPORTED_SYMBOL";

export class MarketBuyError extends Error {
  constructor(
    readonly code: MarketBuyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MarketBuyError";
  }
}

@Injectable()
export class MarketBuyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marketCache: MarketCacheService,
  ) {}

  async execute(input: MarketBuyInput): Promise<MarketBuyExecution> {
    const market = parseMarket(input.symbol);
    const quantity = parseQuantity(input.quantity);
    const executionPrice = this.getExecutionPrice(market.symbol);
    const quoteAmount = parseQuoteAmount(executionPrice, quantity);

    // Concurrent orders can contend on the same USD row and position; retry only transaction conflicts.
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.client.$transaction(
          (transaction) =>
            this.executeTransaction(transaction, {
              ...input,
              executionPrice,
              market,
              quantity,
              quoteAmount,
            }),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof MarketBuyError) throw error;
        if (isSerializationConflict(error) && attempt < MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS) {
          continue;
        }
        if (isSerializationConflict(error)) {
          throw new MarketBuyError(
            "ORDER_CONFLICT",
            "The order could not be completed because account balances changed. Please try again.",
          );
        }
        throw error;
      }
    }

    throw new MarketBuyError(
      "ORDER_CONFLICT",
      "The order could not be completed. Please try again.",
    );
  }

  private getExecutionPrice(symbol: string): string {
    const price = this.marketCache.getTicker(symbol)?.price;
    if (!price) {
      throw new MarketBuyError(
        "MARKET_DATA_UNAVAILABLE",
        "A current market price is unavailable for this symbol.",
      );
    }

    try {
      return requirePositiveDecimal(price, "execution price");
    } catch (error) {
      if (error instanceof TradingDomainError) {
        throw new MarketBuyError(
          "MARKET_DATA_UNAVAILABLE",
          "A current market price is unavailable for this symbol.",
        );
      }
      throw error;
    }
  }

  private async executeTransaction(
    transaction: Prisma.TransactionClient,
    input: Readonly<{
      executionPrice: string;
      market: MarketDefinition;
      quantity: string;
      quoteAmount: string;
      symbol: string;
      userId: string;
    }>,
  ): Promise<MarketBuyExecution> {
    const debitedQuoteBalance = await transaction.walletBalance.updateMany({
      data: { available: { decrement: input.quoteAmount } },
      where: {
        asset: input.market.quoteAsset,
        available: { gte: input.quoteAmount },
        userId: input.userId,
      },
    });
    if (debitedQuoteBalance.count !== 1) {
      throw new MarketBuyError(
        "INSUFFICIENT_BALANCE",
        `Insufficient ${input.market.quoteAsset} balance.`,
      );
    }

    await transaction.walletBalance.upsert({
      create: {
        asset: input.market.baseAsset,
        available: input.quantity,
        locked: "0",
        userId: input.userId,
      },
      update: { available: { increment: input.quantity } },
      where: {
        userId_asset: { asset: input.market.baseAsset, userId: input.userId },
      },
    });

    const currentPosition = await transaction.position.findUnique({
      select: { averageCostUsd: true, quantity: true, realizedPnlUsd: true },
      where: {
        userId_asset: { asset: input.market.baseAsset, userId: input.userId },
      },
    });
    const nextPosition = calculatePositionAfterBuy(
      {
        averageCostUsd: currentPosition?.averageCostUsd.toString() ?? "0",
        quantity: currentPosition?.quantity.toString() ?? "0",
        realizedPnlUsd: currentPosition?.realizedPnlUsd.toString() ?? "0",
      },
      input.quantity,
      input.executionPrice,
    );
    await transaction.position.upsert({
      create: { ...nextPosition, asset: input.market.baseAsset, userId: input.userId },
      update: nextPosition,
      where: {
        userId_asset: { asset: input.market.baseAsset, userId: input.userId },
      },
    });

    const executedAt = new Date();
    const order = await transaction.order.create({
      data: {
        avgFillPrice: input.executionPrice,
        baseAsset: input.market.baseAsset,
        filledAt: executedAt,
        filledQuantity: input.quantity,
        quantity: input.quantity,
        quoteAsset: input.market.quoteAsset,
        side: "BUY",
        status: "FILLED",
        symbol: input.market.symbol,
        type: "MARKET",
        userId: input.userId,
      },
      select: { id: true },
    });
    const trade = await transaction.trade.create({
      data: {
        executedAt,
        orderId: order.id,
        price: input.executionPrice,
        quantity: input.quantity,
        quoteAmount: input.quoteAmount,
        side: "BUY",
        symbol: input.market.symbol,
        userId: input.userId,
      },
      select: { id: true },
    });

    return {
      executionPrice: input.executionPrice,
      executedAt,
      orderId: order.id,
      quantity: input.quantity,
      quoteAmount: input.quoteAmount,
      symbol: input.market.symbol,
      tradeId: trade.id,
    };
  }
}

type MarketDefinition = Readonly<{
  baseAsset: string;
  quoteAsset: string;
  symbol: string;
}>;

function parseMarket(symbol: string): MarketDefinition {
  if (!isSupportedMarketSymbol(symbol)) {
    throw new MarketBuyError("UNSUPPORTED_SYMBOL", "This market symbol is not supported.");
  }

  const [baseAsset, quoteAsset] = symbol.split("-");
  return { baseAsset, quoteAsset, symbol };
}

function parseQuantity(quantity: string): string {
  try {
    return requirePositiveDecimal(quantity, "quantity");
  } catch (error) {
    if (error instanceof TradingDomainError) {
      throw new MarketBuyError("INVALID_QUANTITY", "Quantity must be greater than zero.");
    }
    throw error;
  }
}

function parseQuoteAmount(price: string, quantity: string): string {
  try {
    return calculateQuoteAmount(price, quantity);
  } catch (error) {
    if (error instanceof TradingDomainError) {
      throw new MarketBuyError("INVALID_QUANTITY", "Quantity is too small or too large to trade.");
    }
    throw error;
  }
}

function isSerializationConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}
