import type { PortfolioResponse } from "@pulse-trade/contracts";

type PortfolioPosition = PortfolioResponse["data"]["positions"][number];

export type PortfolioHolding = PortfolioPosition & {
  name: string;
  symbol: string;
};

const assetNames: Readonly<Record<string, string>> = {
  ADA: "Cardano",
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  XRP: "XRP",
};

export function createPortfolioHoldings(
  positions: readonly PortfolioPosition[],
  quoteCurrency: string,
): PortfolioHolding[] {
  return positions
    .filter((position) => isPositiveDecimal(position.quantity))
    .map((position) => ({
      ...position,
      name: assetNames[position.asset] ?? position.asset,
      symbol: `${position.asset}-${quoteCurrency}`,
    }));
}

export function portfolioTickerSymbols(holdings: readonly PortfolioHolding[]): string[] {
  return [...new Set(holdings.map((holding) => holding.symbol))].sort();
}

export function filterHoldings(
  holdings: readonly PortfolioHolding[],
  searchTerm: string,
  hideSmallBalances: boolean,
  smallBalanceAssets: ReadonlySet<string>,
): PortfolioHolding[] {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();

  return holdings.filter((holding) => {
    if (hideSmallBalances && smallBalanceAssets.has(holding.asset)) return false;
    if (!normalizedSearch) return true;

    return `${holding.asset} ${holding.name}`.toLocaleLowerCase().includes(normalizedSearch);
  });
}

function isPositiveDecimal(value: string): boolean {
  return /[1-9]/.test(value);
}
