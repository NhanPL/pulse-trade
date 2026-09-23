export type HoldingTone = "positive" | "negative" | "neutral";

export type HoldingPreview = {
  asset: string;
  name: string;
  quantity: string;
  allocation: string;
  averageCost: string;
  currentPrice: string;
  change: string;
  changeTone: HoldingTone;
  marketValue: string;
  unrealizedPnl: string;
  unrealizedPnlPercent: string;
  pnlTone: HoldingTone;
  isSmallBalance: boolean;
};

export type HoldingPreviewTotals = {
  assetCount: number;
  marketValue: string;
  unrealizedPnl: string;
  unrealizedPnlPercent: string;
  pnlTone: HoldingTone;
};

export function filterHoldingPreviews(
  holdings: readonly HoldingPreview[],
  searchTerm: string,
  hideSmallBalances: boolean,
): HoldingPreview[] {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();

  return holdings.filter((holding) => {
    if (hideSmallBalances && holding.isSmallBalance) return false;
    if (!normalizedSearch) return true;

    return `${holding.asset} ${holding.name}`.toLocaleLowerCase().includes(normalizedSearch);
  });
}
