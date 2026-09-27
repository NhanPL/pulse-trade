import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { OrdersListQuery, OrdersListResponse } from "@pulse-trade/contracts";

import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { OrdersQueryError } from "./orders-query.error";

@Injectable()
export class OrdersQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: OrdersListQuery): Promise<OrdersListResponse["data"]> {
    try {
      return await this.prisma.client.$transaction(
        async (transaction) => {
          const cursor = query.cursor
            ? await transaction.order.findFirst({
                select: { createdAt: true, id: true },
                where: { id: query.cursor, userId },
              })
            : undefined;
          if (query.cursor && !cursor) {
            throw new OrdersQueryError("The orders cursor is invalid for this account.");
          }

          const where: Prisma.OrderWhereInput = {
            userId,
            ...(query.side ? { side: query.side } : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(query.symbol ? { symbol: query.symbol } : {}),
            ...(cursor
              ? {
                  OR: [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                  ],
                }
              : {}),
          };
          const rows = await transaction.order.findMany({
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              avgFillPrice: true,
              cancelledAt: true,
              createdAt: true,
              filledAt: true,
              filledQuantity: true,
              id: true,
              limitPrice: true,
              quantity: true,
              side: true,
              status: true,
              symbol: true,
              type: true,
            },
            take: query.limit + 1,
            where,
          });
          const hasNextPage = rows.length > query.limit;
          const page = hasNextPage ? rows.slice(0, query.limit) : rows;

          return {
            items: page.map((order) => ({
              avgFillPrice: order.avgFillPrice?.toString() ?? null,
              cancelledAt: order.cancelledAt?.toISOString() ?? null,
              createdAt: order.createdAt.toISOString(),
              filledAt: order.filledAt?.toISOString() ?? null,
              filledQuantity: order.filledQuantity.toString(),
              id: order.id,
              limitPrice: order.limitPrice?.toString() ?? null,
              quantity: order.quantity.toString(),
              side: order.side,
              status: order.status,
              symbol: order.symbol,
              type: order.type,
            })),
            nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    } catch (error) {
      if (error instanceof OrdersQueryError) throw error;
      throw new ServiceUnavailableException({
        error: {
          code: "ORDERS_UNAVAILABLE",
          details: null,
          message: "Orders are temporarily unavailable. Please try again later.",
        },
      });
    }
  }
}
