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
          const [walletBalances, positions] = await Promise.all([
            transaction.walletBalance.findMany({
              where: { userId },
              orderBy: { asset: "asc" },
              select: { asset: true, available: true, locked: true },
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
          const balances = walletBalances.map((balance) => ({
            asset: balance.asset,
            available: balance.available.toString(),
            locked: balance.locked.toString(),
          }));
          const cash = balances.find((balance) => balance.asset === QUOTE_CURRENCY);

          return {
            balances,
            quoteCurrency: QUOTE_CURRENCY,
            cash: {
              available: cash?.available ?? "0",
              locked: cash?.locked ?? "0",
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
