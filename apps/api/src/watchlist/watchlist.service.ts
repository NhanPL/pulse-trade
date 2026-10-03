import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { WatchlistItem } from "@pulse-trade/contracts";

import { PrismaService } from "../database/prisma.service";
import { isSupportedMarketSymbol } from "../markets/supported-markets";

const itemSelect = { createdAt: true, id: true, symbol: true } as const;

@Injectable()
export class WatchlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<WatchlistItem[]> {
    try {
      const items = await this.prisma.client.watchlistItem.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: itemSelect,
      });
      return items.map(toWatchlistItem);
    } catch {
      throw watchlistUnavailable();
    }
  }

  async add(userId: string, symbol: string): Promise<WatchlistItem> {
    assertSupportedSymbol(symbol);
    try {
      const item = await this.prisma.client.watchlistItem.upsert({
        where: { userId_symbol: { userId, symbol } },
        create: { userId, symbol },
        // A same-value update allows an atomic database upsert without changing identity or save time.
        update: { symbol },
        select: itemSelect,
      });
      return toWatchlistItem(item);
    } catch {
      throw watchlistUnavailable();
    }
  }

  async remove(userId: string, symbol: string): Promise<void> {
    assertSupportedSymbol(symbol);
    try {
      // deleteMany keeps missing-item removal idempotent while always enforcing ownership.
      await this.prisma.client.watchlistItem.deleteMany({ where: { userId, symbol } });
    } catch {
      throw watchlistUnavailable();
    }
  }
}

function toWatchlistItem(item: { createdAt: Date; id: string; symbol: string }): WatchlistItem {
  return { createdAt: item.createdAt.toISOString(), id: item.id, symbol: item.symbol };
}

function assertSupportedSymbol(symbol: string): void {
  if (!isSupportedMarketSymbol(symbol)) {
    throw new BadRequestException({
      error: {
        code: "UNSUPPORTED_SYMBOL",
        details: null,
        message: "This market symbol is not supported.",
      },
    });
  }
}

function watchlistUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    error: {
      code: "WATCHLIST_UNAVAILABLE",
      details: null,
      message: "Watchlist is temporarily unavailable. Please try again later.",
    },
  });
}
