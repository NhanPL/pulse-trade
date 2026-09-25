import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { MarketOrderError } from "./market-order.error";
import {
  type MarketDefinition,
  parseLimitOrderPrice,
  parseMarketOrderQuantity,
  parseMarketOrderSymbol,
} from "./market-order.input";

const MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

export type LimitSellInput = Readonly<{
  limitPrice: string;
  quantity: string;
  symbol: string;
  userId: string;
}>;

export type LimitSellReservation = Readonly<{
  limitPrice: string;
  orderId: string;
  quantity: string;
  reservedAmount: string;
  reservedAsset: string;
  symbol: string;
}>;

@Injectable()
export class LimitSellService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(input: LimitSellInput): Promise<LimitSellReservation> {
    const market = parseMarketOrderSymbol(input.symbol);
    const quantity = parseMarketOrderQuantity(input.quantity);
    const limitPrice = parseLimitOrderPrice(input.limitPrice);

    // A conditional wallet update protects the invariant; serializable retries resolve contention.
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.client.$transaction(
          (transaction) =>
            this.reserveTransaction(transaction, {
              limitPrice,
              market,
              quantity,
              userId: input.userId,
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
            "The order could not reserve assets because account balances changed.",
          );
        }
        throw error;
      }
    }

    throw new MarketOrderError("ORDER_CONFLICT", "The order could not reserve assets.");
  }

  private async reserveTransaction(
    transaction: Prisma.TransactionClient,
    input: Readonly<{
      limitPrice: string;
      market: MarketDefinition;
      quantity: string;
      userId: string;
    }>,
  ): Promise<LimitSellReservation> {
    const reservedBaseBalance = await transaction.walletBalance.updateMany({
      data: {
        available: { decrement: input.quantity },
        locked: { increment: input.quantity },
      },
      where: {
        asset: input.market.baseAsset,
        available: { gte: input.quantity },
        userId: input.userId,
      },
    });
    if (reservedBaseBalance.count !== 1) {
      throw new MarketOrderError(
        "INSUFFICIENT_BALANCE",
        `Insufficient ${input.market.baseAsset} balance.`,
      );
    }

    const order = await transaction.order.create({
      data: {
        baseAsset: input.market.baseAsset,
        limitPrice: input.limitPrice,
        quantity: input.quantity,
        quoteAsset: input.market.quoteAsset,
        reservedAmount: input.quantity,
        reservedAsset: input.market.baseAsset,
        side: "SELL",
        status: "PENDING",
        symbol: input.market.symbol,
        type: "LIMIT",
        userId: input.userId,
      },
      select: { id: true },
    });

    return {
      limitPrice: input.limitPrice,
      orderId: order.id,
      quantity: input.quantity,
      reservedAmount: input.quantity,
      reservedAsset: input.market.baseAsset,
      symbol: input.market.symbol,
    };
  }
}

function isSerializationConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}
