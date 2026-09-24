import { isSupportedMarketSymbol } from "../markets/supported-markets";
import { TradingDomainError, calculateQuoteAmount, requirePositiveDecimal } from "./domain/decimal";
import { MarketOrderError } from "./market-order.error";

export type MarketDefinition = Readonly<{
  baseAsset: string;
  quoteAsset: string;
  symbol: string;
}>;

export function parseMarketOrderSymbol(symbol: string): MarketDefinition {
  if (!isSupportedMarketSymbol(symbol)) {
    throw new MarketOrderError("UNSUPPORTED_SYMBOL", "This market symbol is not supported.");
  }

  const [baseAsset, quoteAsset] = symbol.split("-");
  return { baseAsset, quoteAsset, symbol };
}

export function parseMarketOrderQuantity(quantity: string): string {
  try {
    return requirePositiveDecimal(quantity, "quantity");
  } catch (error) {
    if (error instanceof TradingDomainError) {
      throw new MarketOrderError("INVALID_QUANTITY", "Quantity must be greater than zero.");
    }
    throw error;
  }
}

export function parseLimitOrderPrice(limitPrice: string): string {
  try {
    return requirePositiveDecimal(limitPrice, "limit price");
  } catch (error) {
    if (error instanceof TradingDomainError) {
      throw new MarketOrderError("INVALID_LIMIT_PRICE", "Limit price must be greater than zero.");
    }
    throw error;
  }
}

export function calculateLimitBuyReservation(limitPrice: string, quantity: string): string {
  try {
    return calculateQuoteAmount(limitPrice, quantity);
  } catch (error) {
    if (error instanceof TradingDomainError) {
      throw new MarketOrderError(
        "INVALID_LIMIT_PRICE",
        "Limit price and quantity produce an unsupported reservation amount.",
      );
    }
    throw error;
  }
}

export function parseMarketExecutionPrice(price: string | undefined): string {
  if (!price) {
    throw new MarketOrderError(
      "MARKET_DATA_UNAVAILABLE",
      "A current market price is unavailable for this symbol.",
    );
  }

  try {
    return requirePositiveDecimal(price, "execution price");
  } catch (error) {
    if (error instanceof TradingDomainError) {
      throw new MarketOrderError(
        "MARKET_DATA_UNAVAILABLE",
        "A current market price is unavailable for this symbol.",
      );
    }
    throw error;
  }
}

export function calculateMarketQuoteAmount(price: string, quantity: string): string {
  try {
    return calculateQuoteAmount(price, quantity);
  } catch (error) {
    if (error instanceof TradingDomainError) {
      throw new MarketOrderError(
        "INVALID_QUANTITY",
        "Quantity is too small or too large to trade.",
      );
    }
    throw error;
  }
}
