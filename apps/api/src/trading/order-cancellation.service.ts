import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import {
  TradingDomainError,
  calculateQuoteAmount,
  compareDecimals,
  requirePositiveDecimal,
} from "./domain/decimal";
import { OrderCancellationError } from "./order-cancellation.error";

const MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

export type OrderCancellation = Readonly<{
  cancelledAt: Date;
  orderId: string;
  releasedAmount: string;
  releasedAsset: string;
}>;

@Injectable()
export class OrderCancellationService {
  constructor(private readonly prisma: PrismaService) {}

  async cancel(orderId: string, userId: string): Promise<OrderCancellation> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.client.$transaction(
          (transaction) => this.cancelTransaction(transaction, orderId, userId),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof OrderCancellationError) throw error;
        if (isSerializationConflict(error) && attempt < MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS) {
          continue;
        }
        if (isSerializationConflict(error)) throw orderNotCancellable(orderId);
        throw error;
      }
    }

    throw orderNotCancellable(orderId);
  }

  private async cancelTransaction(
    transaction: Prisma.TransactionClient,
    orderId: string,
    userId: string,
  ): Promise<OrderCancellation> {
    const order = await transaction.order.findUnique({
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
        type: true,
      },
      where: { id_userId: { id: orderId, userId } },
    });
    if (!order) {
      throw new OrderCancellationError("ORDER_NOT_FOUND", `Order ${orderId} was not found.`);
    }
    if (
      order.status !== "PENDING" ||
      order.type !== "LIMIT" ||
      !order.limitPrice ||
      !order.reservedAsset
    ) {
      throw orderNotCancellable(orderId);
    }

    let quantity: string;
    let reservedAmount: string;
    try {
      quantity = requirePositiveDecimal(order.quantity.toString(), "quantity");
      reservedAmount = requirePositiveDecimal(order.reservedAmount.toString(), "reserved amount");
      const expectedAsset = order.side === "BUY" ? order.quoteAsset : order.baseAsset;
      const expectedAmount =
        order.side === "BUY"
          ? calculateQuoteAmount(order.limitPrice.toString(), quantity)
          : quantity;
      if (
        order.reservedAsset !== expectedAsset ||
        compareDecimals(reservedAmount, expectedAmount) !== 0
      ) {
        throw orderNotCancellable(orderId);
      }
    } catch (error) {
      if (error instanceof OrderCancellationError) throw error;
      if (error instanceof TradingDomainError) throw orderNotCancellable(orderId);
      throw error;
    }

    const releasedReservation = await transaction.walletBalance.updateMany({
      data: {
        available: { increment: reservedAmount },
        locked: { decrement: reservedAmount },
      },
      where: {
        asset: order.reservedAsset,
        locked: { gte: reservedAmount },
        userId,
      },
    });
    if (releasedReservation.count !== 1) throw orderNotCancellable(orderId);

    const cancelledAt = new Date();
    await transaction.order.update({
      data: { cancelledAt, status: "CANCELLED" },
      where: { id: order.id },
    });

    return {
      cancelledAt,
      orderId: order.id,
      releasedAmount: reservedAmount,
      releasedAsset: order.reservedAsset,
    };
  }
}

function orderNotCancellable(orderId: string): OrderCancellationError {
  return new OrderCancellationError(
    "ORDER_NOT_CANCELLABLE",
    `Order ${orderId} is no longer pending or has an invalid reservation.`,
  );
}

function isSerializationConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}
