export type OrderBookSide = "ask" | "bid";

export type OrderBookPreviewLevel = {
  amount: string;
  depthPercent: number;
  price: string;
  total: string;
};

export type OrderBookPreview = {
  asks: readonly OrderBookPreviewLevel[];
  bids: readonly OrderBookPreviewLevel[];
};

const LEVEL_COUNT = 5;
const TARGET_NOTIONALS = [840, 510, 1260, 690, 980, 430, 1120, 760, 570, 1350] as const;
const DEPTH_PERCENTAGES = [24, 31, 43, 49, 58, 66, 73, 81, 89, 96] as const;

function pricePrecision(price: number): number {
  if (price < 1) return 4;
  if (price < 100) return 3;
  return 2;
}

function buildLevels(midPrice: number, side: OrderBookSide): OrderBookPreviewLevel[] {
  const precision = pricePrecision(midPrice);
  const minimumTick = 10 ** -precision;
  const step = Math.max(midPrice * 0.0000075, minimumTick);
  const direction = side === "ask" ? 1 : -1;

  let cumulativeAmount = 0;

  return Array.from({ length: LEVEL_COUNT }, (_, index) => {
    // These values only populate the static preview; provider decimals remain strings end to end.
    const price = midPrice + direction * step * (index + 1);
    const amount = TARGET_NOTIONALS[index] / price;
    cumulativeAmount += amount;

    return {
      amount: amount.toFixed(8),
      depthPercent: DEPTH_PERCENTAGES[index],
      price: price.toFixed(precision),
      total: cumulativeAmount.toFixed(8),
    };
  });
}

export function createOrderBookPreview(midPrice: string): OrderBookPreview {
  const numericMidPrice = Number(midPrice);

  return {
    asks: buildLevels(numericMidPrice, "ask"),
    bids: buildLevels(numericMidPrice, "bid"),
  };
}
