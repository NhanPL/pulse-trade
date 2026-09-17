import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { calculatePositionAfterBuy } from "./domain/position-calculations";
import { MarketExecutionPriceService } from "./market-execution-price.service";
import { MarketOrderError } from "./market-order.error";
import {
  type MarketDefinition,
  calculateMarketQuoteAmount,
  parseMarketOrderQuantity,
  parseMarketOrderSymbol,
} from "./market-order.input";

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

@Injectable()
export class MarketBuyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionPrices: MarketExecutionPriceService,
  ) {}

  async execute(input: MarketBuyInput): Promise<MarketBuyExecution> {
    const market = parseMarketOrderSymbol(input.symbol);
    const quantity = parseMarketOrderQuantity(input.quantity);
    // Concurrent orders can contend on the same USD row and position; retry only transaction conflicts.
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS; attempt++) {
      const executionPrice = this.executionPrices.getPrice(market.symbol);
      const quoteAmount = calculateMarketQuoteAmount(executionPrice, quantity);
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
      throw new MarketOrderError(
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

function isSerializationConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}
