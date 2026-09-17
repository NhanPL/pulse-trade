import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { MarketCacheService } from "../realtime/market-cache.service";
import { TradingDomainError } from "./domain/decimal";
import {
  calculatePositionAfterSell,
  type SellPositionUpdate,
} from "./domain/position-calculations";
import { MarketOrderError } from "./market-order.error";
import {
  type MarketDefinition,
  calculateMarketQuoteAmount,
  parseMarketExecutionPrice,
  parseMarketOrderQuantity,
  parseMarketOrderSymbol,
} from "./market-order.input";

const MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

export type MarketSellInput = Readonly<{
  quantity: string;
  symbol: string;
  userId: string;
}>;

export type MarketSellExecution = Readonly<{
  executionPrice: string;
  executedAt: Date;
  orderId: string;
  quantity: string;
  quoteAmount: string;
  symbol: string;
  tradeId: string;
}>;

@Injectable()
export class MarketSellService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marketCache: MarketCacheService,
  ) {}

  async execute(input: MarketSellInput): Promise<MarketSellExecution> {
    const market = parseMarketOrderSymbol(input.symbol);
    const quantity = parseMarketOrderQuantity(input.quantity);
    const executionPrice = parseMarketExecutionPrice(
      this.marketCache.getTicker(market.symbol)?.price,
    );
    const quoteAmount = calculateMarketQuoteAmount(executionPrice, quantity);

    // Concurrent orders can contend on the same base wallet and position; retry only transaction conflicts.
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
        if (error instanceof MarketOrderError) throw error;
        if (isSerializationConflict(error) && attempt < MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS) {
          continue;
        }
        if (isSerializationConflict(error)) {
          throw new MarketOrderError(
            "ORDER_CONFLICT",
            "The order could not be completed because account balances changed. Please try again.",
          );
        }
        throw error;
      }
    }

    throw new MarketOrderError(
      "ORDER_CONFLICT",
      "The order could not be completed. Please try again.",
    );
  }

  private async executeTransaction(
    transaction: Prisma.TransactionClient,
    input: Readonly<{
      executionPrice: string;
      market: MarketDefinition;
      quantity: string;
      quoteAmount: string;
      userId: string;
    }>,
  ): Promise<MarketSellExecution> {
    const currentPosition = await transaction.position.findUnique({
      select: { averageCostUsd: true, quantity: true, realizedPnlUsd: true },
      where: {
        userId_asset: { asset: input.market.baseAsset, userId: input.userId },
      },
    });
    if (!currentPosition) {
      throw insufficientAssetBalance(input.market.baseAsset);
    }

    let positionUpdate: SellPositionUpdate;
    try {
      positionUpdate = calculatePositionAfterSell(
        {
          averageCostUsd: currentPosition.averageCostUsd.toString(),
          quantity: currentPosition.quantity.toString(),
          realizedPnlUsd: currentPosition.realizedPnlUsd.toString(),
        },
        input.quantity,
        input.executionPrice,
      );
    } catch (error) {
      if (error instanceof TradingDomainError)
        throw insufficientAssetBalance(input.market.baseAsset);
      throw error;
    }

    const debitedBaseBalance = await transaction.walletBalance.updateMany({
      data: { available: { decrement: input.quantity } },
      where: {
        asset: input.market.baseAsset,
        available: { gte: input.quantity },
        userId: input.userId,
      },
    });
    if (debitedBaseBalance.count !== 1) {
      throw insufficientAssetBalance(input.market.baseAsset);
    }

    const updatedPosition = await transaction.position.updateMany({
      data: positionUpdate.position,
      where: {
        asset: input.market.baseAsset,
        quantity: { gte: input.quantity },
        userId: input.userId,
      },
    });
    if (updatedPosition.count !== 1) {
      throw insufficientAssetBalance(input.market.baseAsset);
    }

    await transaction.walletBalance.upsert({
      create: {
        asset: input.market.quoteAsset,
        available: input.quoteAmount,
        locked: "0",
        userId: input.userId,
      },
      update: { available: { increment: input.quoteAmount } },
      where: {
        userId_asset: { asset: input.market.quoteAsset, userId: input.userId },
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
        side: "SELL",
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
        side: "SELL",
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

function insufficientAssetBalance(asset: string): MarketOrderError {
  return new MarketOrderError("INSUFFICIENT_BALANCE", `Insufficient ${asset} balance.`);
}

function isSerializationConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}
