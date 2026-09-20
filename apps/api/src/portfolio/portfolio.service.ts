import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { PortfolioResponse } from "@pulse-trade/contracts";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

const QUOTE_CURRENCY = "USD" as const;

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(userId: string): Promise<PortfolioResponse["data"]> {
    try {
      return await this.prisma.client.$transaction(
        async (transaction) => {
          const [cash, positions] = await Promise.all([
            transaction.walletBalance.findUnique({
              where: { userId_asset: { asset: QUOTE_CURRENCY, userId } },
              select: { available: true, locked: true },
            }),
            transaction.position.findMany({
              where: { userId },
              orderBy: { asset: "asc" },
              select: {
                asset: true,
                averageCostUsd: true,
                quantity: true,
                realizedPnlUsd: true,
              },
            }),
          ]);

          return {
            quoteCurrency: QUOTE_CURRENCY,
            cash: {
              available: cash?.available.toString() ?? "0",
              locked: cash?.locked.toString() ?? "0",
            },
            // Closed positions retain realized P&L; the later holdings UI filters zero quantities.
            positions: positions.map((position) => ({
              asset: position.asset,
              averageCost: position.averageCostUsd.toString(),
              quantity: position.quantity.toString(),
              realizedPnl: position.realizedPnlUsd.toString(),
            })),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    } catch {
      throw new ServiceUnavailableException({
        error: {
          code: "PORTFOLIO_UNAVAILABLE",
          details: null,
          message: "Portfolio is temporarily unavailable. Please try again later.",
        },
      });
    }
  }
}
