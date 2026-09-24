import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { MarketOrderError } from "./market-order.error";
import {
  type MarketDefinition,
  calculateLimitBuyReservation,
  parseLimitOrderPrice,
  parseMarketOrderQuantity,
  parseMarketOrderSymbol,
} from "./market-order.input";

const MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

export type LimitBuyInput = Readonly<{
  limitPrice: string;
  quantity: string;
  symbol: string;
  userId: string;
}>;

export type LimitBuyReservation = Readonly<{
  limitPrice: string;
  orderId: string;
  quantity: string;
  reservedAmount: string;
  reservedAsset: string;
  symbol: string;
}>;

@Injectable()
export class LimitBuyService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(input: LimitBuyInput): Promise<LimitBuyReservation> {
    const market = parseMarketOrderSymbol(input.symbol);
    const quantity = parseMarketOrderQuantity(input.quantity);
    const limitPrice = parseLimitOrderPrice(input.limitPrice);
    const reservedAmount = calculateLimitBuyReservation(limitPrice, quantity);

    // A conditional wallet update protects the invariant; serializable retries resolve contention.
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.client.$transaction(
          (transaction) =>
            this.reserveTransaction(transaction, {
              limitPrice,
              market,
              quantity,
              reservedAmount,
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
            "The order could not reserve funds because account balances changed.",
          );
        }
        throw error;
      }
    }

    throw new MarketOrderError("ORDER_CONFLICT", "The order could not reserve funds.");
  }

  private async reserveTransaction(
    transaction: Prisma.TransactionClient,
    input: Readonly<{
      limitPrice: string;
      market: MarketDefinition;
      quantity: string;
      reservedAmount: string;
      userId: string;
    }>,
  ): Promise<LimitBuyReservation> {
    const reservedQuoteBalance = await transaction.walletBalance.updateMany({
      data: {
        available: { decrement: input.reservedAmount },
        locked: { increment: input.reservedAmount },
      },
      where: {
        asset: input.market.quoteAsset,
        available: { gte: input.reservedAmount },
        userId: input.userId,
      },
    });
    if (reservedQuoteBalance.count !== 1) {
      throw new MarketOrderError(
        "INSUFFICIENT_BALANCE",
        `Insufficient ${input.market.quoteAsset} balance.`,
      );
    }

    const order = await transaction.order.create({
      data: {
        baseAsset: input.market.baseAsset,
        limitPrice: input.limitPrice,
        quantity: input.quantity,
        quoteAsset: input.market.quoteAsset,
        reservedAmount: input.reservedAmount,
        reservedAsset: input.market.quoteAsset,
        side: "BUY",
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
      reservedAmount: input.reservedAmount,
      reservedAsset: input.market.quoteAsset,
      symbol: input.market.symbol,
    };
  }
}

function isSerializationConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}
