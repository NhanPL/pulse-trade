import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/PageContainer";
import { MARKET_TABLE_MOCK } from "@/features/market/model/market-table.mock";
import { getSupportedMarket, SUPPORTED_MARKETS } from "@/features/market/model/supported-markets";
import { TradingMarketHeader } from "@/features/trading/components/TradingMarketHeader";
import { UnsupportedMarketState } from "@/features/trading/components/UnsupportedMarketState";

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

      <section
        aria-label="Trading workspace placeholder"
        className="min-h-64 rounded-xl border border-dashed border-border bg-surface/50 p-6"
      >
        <p className="max-w-lg text-sm leading-6 text-foreground-muted">
          The market route is ready. Trading widgets will be added in the following trading-screen
          tasks.
        </p>
      </section>
    </PageContainer>
  );
}
