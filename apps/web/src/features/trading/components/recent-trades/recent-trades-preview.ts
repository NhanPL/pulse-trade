export type TradeSide = "BUY" | "SELL";

export type RecentTradePreview = {
  id: string;
  marketTs: number;
  price: string;
  quantity: string;
  side: TradeSide;
};

const PREVIEW_TRADE_COUNT = 12;
const BASE_MARKET_TIMESTAMP = 1_787_839_999_900;
const PRICE_OFFSETS = [0, -1, 1, 2, -2, 1, -3, 2, 3, -1, -2, 1] as const;
const NOTIONALS = [620, 410, 890, 540, 730, 360, 960, 680, 450, 810, 570, 1020] as const;

function pricePrecision(price: number): number {
  if (price < 1) return 4;
  if (price < 100) return 3;
  return 2;
}

export function createRecentTradesPreview(midPrice: string): readonly RecentTradePreview[] {
  const numericMidPrice = Number(midPrice);
  const precision = pricePrecision(numericMidPrice);
  const minimumTick = 10 ** -precision;
  const tick = Math.max(numericMidPrice * 0.00005, minimumTick);

  // The fixed-size preview mirrors normalized payload fields without acting as a realtime buffer.
  return Array.from({ length: PREVIEW_TRADE_COUNT }, (_, index) => {
    const price = numericMidPrice + PRICE_OFFSETS[index] * tick;
    const marketTs = BASE_MARKET_TIMESTAMP - index * 7_000;

    return {
      id: `preview-${marketTs}-${index}`,
      marketTs,
      price: price.toFixed(precision),
      quantity: (NOTIONALS[index] / price).toFixed(8),
      side: index % 3 === 1 ? "SELL" : "BUY",
    };
  });
}
