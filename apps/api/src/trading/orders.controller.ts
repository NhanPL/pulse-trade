import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Header,
  Headers,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  marketOrderRequestSchema,
  marketOrderResponseSchema,
  type MarketOrderRequest,
  type MarketOrderResponse,
} from "@pulse-trade/contracts";

import { CurrentUserService } from "../auth/current-user.service";
import { MarketBuyService } from "./market-buy.service";
import { MarketOrderError } from "./market-order.error";
import { MarketSellService } from "./market-sell.service";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly marketBuy: MarketBuyService,
    private readonly marketSell: MarketSellService,
  ) {}

  @Post()
  @Header("Cache-Control", "no-store")
  async createMarketOrder(
    @Body() body: unknown,
    @Headers("authorization") authorization: string | undefined,
  ): Promise<MarketOrderResponse> {
    const user = await this.currentUser.resolve(authorization);
    const order = parseMarketOrder(body);
    const executionInput = { quantity: order.quantity, symbol: order.symbol, userId: user.id };

    try {
      const execution =
        order.side === "BUY"
          ? await this.marketBuy.execute(executionInput)
          : await this.marketSell.execute(executionInput);
      return marketOrderResponseSchema.parse({
        data: {
          avgFillPrice: execution.executionPrice,
          id: execution.orderId,
          quantity: execution.quantity,
          side: order.side,
          status: "FILLED",
          symbol: execution.symbol,
          type: "MARKET",
        },
      });
    } catch (error) {
      throwOrderError(error);
    }
  }
}

function parseMarketOrder(body: unknown): MarketOrderRequest {
  const result = marketOrderRequestSchema.safeParse(body);
  if (result.success) return result.data;

  const fieldErrors = result.error.flatten().fieldErrors;
  const code = fieldErrors.quantity ? "INVALID_QUANTITY" : "INVALID_ORDER";
  const message =
    code === "INVALID_QUANTITY"
      ? "Quantity must be a positive decimal string."
      : "Provide a valid MARKET order request.";
  throw new BadRequestException({ error: { code, details: null, message } });
}

function throwOrderError(error: unknown): never {
  if (error instanceof MarketOrderError) {
    const body = { error: { code: error.code, details: null, message: messageFor(error.code) } };
    switch (error.code) {
      case "INSUFFICIENT_BALANCE":
      case "ORDER_CONFLICT":
        throw new ConflictException(body);
      case "MARKET_DATA_STALE":
      case "MARKET_DATA_UNAVAILABLE":
        throw new ServiceUnavailableException(body);
      case "INVALID_QUANTITY":
      case "UNSUPPORTED_SYMBOL":
        throw new BadRequestException(body);
    }
  }

  throw new ServiceUnavailableException({
    error: {
      code: "ORDER_UNAVAILABLE",
      details: null,
      message: "Order placement is temporarily unavailable. Please try again later.",
    },
  });
}

function messageFor(code: MarketOrderError["code"]): string {
  switch (code) {
    case "INSUFFICIENT_BALANCE":
      return "Insufficient available balance for this order.";
    case "INVALID_QUANTITY":
      return "Quantity must be a positive decimal string.";
    case "MARKET_DATA_STALE":
      return "Current market data is stale. Please wait for a live update.";
    case "MARKET_DATA_UNAVAILABLE":
      return "Current market data is unavailable. Please try again later.";
    case "ORDER_CONFLICT":
      return "The order could not be completed because account balances changed. Please try again.";
    case "UNSUPPORTED_SYMBOL":
      return "This market symbol is not supported.";
  }
}
