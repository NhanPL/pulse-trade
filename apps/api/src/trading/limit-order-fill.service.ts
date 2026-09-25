import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import {
  TradingDomainError,
  calculateQuoteAmount,
  compareDecimals,
  requireNonNegativeDecimal,
  requirePositiveDecimal,
  subtractDecimals,
} from "./domain/decimal";
import {
  calculatePositionAfterBuy,
  calculatePositionAfterSell,
  type SellPositionUpdate,
} from "./domain/position-calculations";
import {
  type EligibleLimitOrder,
  PendingOrderEvaluator,
  isLimitOrderEligible,
} from "./pending-order-evaluator.service";

export type LimitOrderFillExecution = Readonly<{
  executedAt: Date;
  executionPrice: string;
  orderId: string;
  quantity: string;
  quoteAmount: string;
  side: "BUY" | "SELL";
  symbol: string;
  tradeId: string;
}>;

type FillableLimitOrder = Readonly<{
  baseAsset: string;
  id: string;
  limitPrice: string;
  quantity: string;
  quoteAsset: string;
  reservedAmount: string;
  reservedAsset: string;
  side: "BUY" | "SELL";
  symbol: string;
  userId: string;
}>;

@Injectable()
export class LimitOrderFillService implements OnModuleInit, OnModuleDestroy {
  private removeEligibleOrderListener: (() => void) | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluator: PendingOrderEvaluator,
  ) {}

  onModuleInit(): void {
    if (this.removeEligibleOrderListener) return;
    this.removeEligibleOrderListener = this.evaluator.onEligibleOrder(async (order) => {
      await this.fill(order);
    });
  }

  onModuleDestroy(): void {
    this.removeEligibleOrderListener?.();
    this.removeEligibleOrderListener = undefined;
  }

  async fill(candidate: EligibleLimitOrder): Promise<LimitOrderFillExecution | undefined> {
    const executionPrice = requirePositiveDecimal(candidate.marketPrice, "execution price");

    return this.prisma.client.$transaction(
      (transaction) => this.fillTransaction(transaction, candidate, executionPrice),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async fillTransaction(
    transaction: Prisma.TransactionClient,
    candidate: EligibleLimitOrder,
    executionPrice: string,
  ): Promise<LimitOrderFillExecution | undefined> {
    const row = await transaction.order.findUnique({
      select: {
        baseAsset: true,
        id: true,
        limitPrice: true,
        quantity: true,
        quoteAsset: true,
        reservedAmount: true,
        reservedAsset: true,
        side: true,
        status: true,
        symbol: true,
        type: true,
        userId: true,
      },
      where: { id: candidate.orderId },
    });

    if (
      !row ||
      row.status !== "PENDING" ||
      row.type !== "LIMIT" ||
      !row.limitPrice ||
      !row.reservedAsset ||
      row.side !== candidate.side ||
      row.symbol !== candidate.symbol
    ) {
      return undefined;
    }

    const limitPrice = requirePositiveDecimal(row.limitPrice.toString(), "limit price");
    if (
      compareDecimals(limitPrice, candidate.limitPrice) !== 0 ||
      !isLimitOrderEligible(row.side, executionPrice, limitPrice)
    ) {
      return undefined;
    }

    const order: FillableLimitOrder = {
      baseAsset: row.baseAsset,
      id: row.id,
      limitPrice,
      quantity: requirePositiveDecimal(row.quantity.toString(), "quantity"),
      quoteAsset: row.quoteAsset,
      reservedAmount: requireNonNegativeDecimal(row.reservedAmount.toString(), "reserved amount"),
      reservedAsset: row.reservedAsset,
      side: row.side,
      symbol: row.symbol,
      userId: row.userId,
    };

    const quoteAmount =
      order.side === "BUY"
        ? await this.fillBuy(transaction, order, executionPrice)
        : await this.fillSell(transaction, order, executionPrice);
    const executedAt = new Date();
    const trade = await transaction.trade.create({
      data: {
        executedAt,
        orderId: order.id,
        price: executionPrice,
        quantity: order.quantity,
        quoteAmount,
        side: order.side,
        symbol: order.symbol,
        userId: order.userId,
      },
      select: { id: true },
    });

    await transaction.order.update({
      data: {
        avgFillPrice: executionPrice,
        filledAt: executedAt,
        filledQuantity: order.quantity,
        status: "FILLED",
      },
      where: { id: order.id },
    });

    return {
      executedAt,
      executionPrice,
      orderId: order.id,
      quantity: order.quantity,
      quoteAmount,
      side: order.side,
      symbol: order.symbol,
      tradeId: trade.id,
    };
  }

  private async fillBuy(
    transaction: Prisma.TransactionClient,
    order: FillableLimitOrder,
    executionPrice: string,
  ): Promise<string> {
    if (order.reservedAsset !== order.quoteAsset) {
      throw invalidReservation(order.id);
    }

    const actualCost = calculateQuoteAmount(executionPrice, order.quantity);
    if (compareDecimals(actualCost, order.reservedAmount) > 0) {
      throw invalidReservation(order.id);
    }
    const priceImprovement = subtractDecimals(order.reservedAmount, actualCost);
    const consumedReservation = await transaction.walletBalance.updateMany({
      data: {
        available: { increment: priceImprovement },
        locked: { decrement: order.reservedAmount },
      },
      where: {
        asset: order.quoteAsset,
        locked: { gte: order.reservedAmount },
        userId: order.userId,
      },
    });
    if (consumedReservation.count !== 1) throw invalidReservation(order.id);

    await transaction.walletBalance.upsert({
      create: {
        asset: order.baseAsset,
        available: order.quantity,
        locked: "0",
        userId: order.userId,
      },
      update: { available: { increment: order.quantity } },
      where: {
        userId_asset: { asset: order.baseAsset, userId: order.userId },
      },
    });

    const currentPosition = await transaction.position.findUnique({
      select: { averageCostUsd: true, quantity: true, realizedPnlUsd: true },
      where: {
        userId_asset: { asset: order.baseAsset, userId: order.userId },
      },
    });
    const nextPosition = calculatePositionAfterBuy(
      {
        averageCostUsd: currentPosition?.averageCostUsd.toString() ?? "0",
        quantity: currentPosition?.quantity.toString() ?? "0",
        realizedPnlUsd: currentPosition?.realizedPnlUsd.toString() ?? "0",
      },
      order.quantity,
      executionPrice,
    );
    await transaction.position.upsert({
      create: { ...nextPosition, asset: order.baseAsset, userId: order.userId },
      update: nextPosition,
      where: {
        userId_asset: { asset: order.baseAsset, userId: order.userId },
      },
    });

    return actualCost;
  }

  private async fillSell(
    transaction: Prisma.TransactionClient,
    order: FillableLimitOrder,
    executionPrice: string,
  ): Promise<string> {
    if (
      order.reservedAsset !== order.baseAsset ||
      compareDecimals(order.reservedAmount, order.quantity) !== 0
    ) {
      throw invalidReservation(order.id);
    }

    const currentPosition = await transaction.position.findUnique({
      select: { averageCostUsd: true, quantity: true, realizedPnlUsd: true },
      where: {
        userId_asset: { asset: order.baseAsset, userId: order.userId },
      },
    });
    if (!currentPosition) throw invalidReservation(order.id);

    let positionUpdate: SellPositionUpdate;
    try {
      positionUpdate = calculatePositionAfterSell(
        {
          averageCostUsd: currentPosition.averageCostUsd.toString(),
          quantity: currentPosition.quantity.toString(),
          realizedPnlUsd: currentPosition.realizedPnlUsd.toString(),
        },
        order.quantity,
        executionPrice,
      );
    } catch (error) {
      if (error instanceof TradingDomainError) throw invalidReservation(order.id);
      throw error;
    }

    const consumedReservation = await transaction.walletBalance.updateMany({
      data: { locked: { decrement: order.quantity } },
      where: {
        asset: order.baseAsset,
        locked: { gte: order.quantity },
        userId: order.userId,
      },
    });
    if (consumedReservation.count !== 1) throw invalidReservation(order.id);

    const updatedPosition = await transaction.position.updateMany({
      data: positionUpdate.position,
      where: {
        asset: order.baseAsset,
        quantity: { gte: order.quantity },
        userId: order.userId,
      },
    });
    if (updatedPosition.count !== 1) throw invalidReservation(order.id);

    await transaction.walletBalance.upsert({
      create: {
        asset: order.quoteAsset,
        available: positionUpdate.proceeds,
        locked: "0",
        userId: order.userId,
      },
      update: { available: { increment: positionUpdate.proceeds } },
      where: {
        userId_asset: { asset: order.quoteAsset, userId: order.userId },
      },
    });

    return positionUpdate.proceeds;
  }
}

function invalidReservation(orderId: string): TradingDomainError {
  return new TradingDomainError(`Limit order ${orderId} has an inconsistent reservation.`);
}
