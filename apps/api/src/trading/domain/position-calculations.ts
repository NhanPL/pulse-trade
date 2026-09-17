import {
  TradingDomainError,
  addDecimals,
  calculateQuoteAmount,
  calculateWeightedAverageCost,
  compareDecimals,
  multiplyDecimals,
  normalizeFinancialDecimal,
  requireNonNegativeDecimal,
  requirePositiveDecimal,
  subtractDecimals,
} from "./decimal";

export type PositionCostBasis = Readonly<{
  quantity: string;
  averageCostUsd: string;
  realizedPnlUsd: string;
}>;

export type SellPositionUpdate = Readonly<{
  position: PositionCostBasis;
  proceeds: string;
  realizedPnlDelta: string;
}>;

function normalizePosition(position: PositionCostBasis): PositionCostBasis {
  return {
    quantity: requireNonNegativeDecimal(position.quantity, "position quantity"),
    averageCostUsd: requireNonNegativeDecimal(position.averageCostUsd, "average cost"),
    realizedPnlUsd: normalizeFinancialDecimal(position.realizedPnlUsd),
  };
}

export function calculatePositionAfterBuy(
  position: PositionCostBasis,
  quantity: string,
  executionPrice: string,
): PositionCostBasis {
  const current = normalizePosition(position);
  const buyQuantity = requirePositiveDecimal(quantity, "quantity");
  const buyPrice = requirePositiveDecimal(executionPrice, "execution price");
  const nextQuantity = addDecimals(current.quantity, buyQuantity);

  return {
    quantity: nextQuantity,
    averageCostUsd: calculateWeightedAverageCost(
      current.quantity,
      current.averageCostUsd,
      buyQuantity,
      buyPrice,
    ),
    realizedPnlUsd: current.realizedPnlUsd,
  };
}

export function calculatePositionAfterSell(
  position: PositionCostBasis,
  quantity: string,
  executionPrice: string,
): SellPositionUpdate {
  const current = normalizePosition(position);
  const sellQuantity = requirePositiveDecimal(quantity, "quantity");
  const sellPrice = requirePositiveDecimal(executionPrice, "execution price");
  if (compareDecimals(sellQuantity, current.quantity) > 0) {
    throw new TradingDomainError("sell quantity exceeds the current position quantity.");
  }

  const nextQuantity = subtractDecimals(current.quantity, sellQuantity);
  const realizedPnlDelta = multiplyDecimals(
    subtractDecimals(sellPrice, current.averageCostUsd),
    sellQuantity,
  );
  const positionIsClosed = compareDecimals(nextQuantity, "0") === 0;
  return {
    proceeds: calculateQuoteAmount(sellPrice, sellQuantity),
    realizedPnlDelta,
    position: {
      quantity: nextQuantity,
      averageCostUsd: positionIsClosed ? "0" : current.averageCostUsd,
      realizedPnlUsd: addDecimals(current.realizedPnlUsd, realizedPnlDelta),
    },
  };
}

export function calculateUnrealizedPnl(position: PositionCostBasis, marketPrice: string): string {
  const current = normalizePosition(position);
  const currentMarketPrice = requirePositiveDecimal(marketPrice, "market price");
  return multiplyDecimals(
    subtractDecimals(currentMarketPrice, current.averageCostUsd),
    current.quantity,
  );
}
