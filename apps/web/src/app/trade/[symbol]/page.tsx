import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { getSupportedMarket, SUPPORTED_MARKETS } from "@/features/market/model/supported-markets";
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

  return (
    <PageContainer className="space-y-6" data-market-symbol={market.symbol}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">
            Trading workspace
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {market.baseAsset}
            <span className="font-normal text-foreground-muted">/{market.quoteAsset}</span>
          </h1>
          <p className="mt-2 font-mono text-sm text-foreground-muted">{market.symbol}</p>
        </div>
        <Badge variant="brand">Public market data</Badge>
      </div>

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
