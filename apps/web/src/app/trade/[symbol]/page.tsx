import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/PageContainer";
import { MARKET_TABLE_MOCK } from "@/features/market/model/market-table.mock";
import { getSupportedMarket, SUPPORTED_MARKETS } from "@/features/market/model/supported-markets";
import { TradingMarketHeader } from "@/features/trading/components/TradingMarketHeader";
import { UnsupportedMarketState } from "@/features/trading/components/UnsupportedMarketState";
import { ChartPanel } from "@/features/trading/components/chart/ChartPanel";
import { OrderBook } from "@/features/trading/components/order-book/OrderBook";
import { RecentTrades } from "@/features/trading/components/recent-trades/RecentTrades";

type TradingPageProps = {
  params: Promise<{ symbol: string }>;
};

export function generateStaticParams() {
  return SUPPORTED_MARKETS.map(({ symbol }) => ({ symbol }));
}

export async function generateMetadata({ params }: TradingPageProps): Promise<Metadata> {
  const { symbol } = await params;
  const market = getSupportedMarket(symbol);

  return {
    title: market ? `${market.baseAsset}/${market.quoteAsset} | PulseTrade` : "Unsupported market",
  };
}

export default async function TradingPage({ params }: TradingPageProps) {
  const { symbol } = await params;
  const market = getSupportedMarket(symbol);

  if (!market) {
    return (
      <PageContainer width="content">
        <UnsupportedMarketState symbol={symbol} />
      </PageContainer>
    );
  }

  const snapshot = MARKET_TABLE_MOCK.find((item) => item.symbol === market.symbol);

  if (!snapshot) {
    throw new Error(`Missing market snapshot configuration for ${market.symbol}.`);
  }

  return (
    <PageContainer className="space-y-6" data-market-symbol={market.symbol}>
      <TradingMarketHeader {...snapshot} />
      <ChartPanel symbol={market.symbol} />
      <OrderBook
        baseAsset={market.baseAsset}
        midPrice={snapshot.price}
        quoteAsset={market.quoteAsset}
        symbol={market.symbol}
      />
      <RecentTrades
        baseAsset={market.baseAsset}
        midPrice={snapshot.price}
        quoteAsset={market.quoteAsset}
        symbol={market.symbol}
      />
    </PageContainer>
  );
}
