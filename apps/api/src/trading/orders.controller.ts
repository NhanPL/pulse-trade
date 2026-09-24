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
  limitBuyOrderRequestSchema,
  limitBuyOrderResponseSchema,
  limitSellOrderRequestSchema,
  limitSellOrderResponseSchema,
  marketOrderRequestSchema,
  marketOrderResponseSchema,
  type LimitBuyOrderRequest,
  type LimitBuyOrderResponse,
  type LimitSellOrderRequest,
  type LimitSellOrderResponse,
  type MarketOrderRequest,
  type MarketOrderResponse,
} from "@pulse-trade/contracts";

import { CurrentUserService } from "../auth/current-user.service";
import { LimitBuyService } from "./limit-buy.service";
import { LimitSellService } from "./limit-sell.service";
import { MarketBuyService } from "./market-buy.service";
import { MarketOrderError } from "./market-order.error";
import { MarketSellService } from "./market-sell.service";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly marketBuy: MarketBuyService,
    private readonly marketSell: MarketSellService,
    private readonly limitBuy: LimitBuyService,
    private readonly limitSell: LimitSellService,
  ) {}

  @Post()
  @Header("Cache-Control", "no-store")
  async createOrder(
    @Body() body: unknown,
    @Headers("authorization") authorization: string | undefined,
  ): Promise<LimitBuyOrderResponse | LimitSellOrderResponse | MarketOrderResponse> {
    const user = await this.currentUser.resolve(authorization);
    const order = parseOrder(body);

    try {
      if (order.type === "LIMIT") {
        if (order.side === "BUY") {
          const reservation = await this.limitBuy.reserve({
            limitPrice: order.limitPrice,
            quantity: order.quantity,
            symbol: order.symbol,
            userId: user.id,
          });
          return limitBuyOrderResponseSchema.parse({
            data: {
              id: reservation.orderId,
              limitPrice: reservation.limitPrice,
              quantity: reservation.quantity,
              side: "BUY",
              status: "PENDING",
              symbol: reservation.symbol,
              type: "LIMIT",
            },
          });
        }

        const reservation = await this.limitSell.reserve({
          limitPrice: order.limitPrice,
          quantity: order.quantity,
          symbol: order.symbol,
          userId: user.id,
        });
        return limitSellOrderResponseSchema.parse({
          data: {
            id: reservation.orderId,
            limitPrice: reservation.limitPrice,
            quantity: reservation.quantity,
            side: "SELL",
            status: "PENDING",
            symbol: reservation.symbol,
            type: "LIMIT",
          },
        });
      }

      const executionInput = { quantity: order.quantity, symbol: order.symbol, userId: user.id };
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

function parseOrder(
  body: unknown,
): LimitBuyOrderRequest | LimitSellOrderRequest | MarketOrderRequest {
  if (isRecord(body) && body.type === "LIMIT") {
    const limitResult =
      body.side === "BUY"
        ? limitBuyOrderRequestSchema.safeParse(body)
        : body.side === "SELL"
          ? limitSellOrderRequestSchema.safeParse(body)
          : undefined;
    if (!limitResult) {
      throw new BadRequestException({
        error: { code: "INVALID_ORDER", details: null, message: "Provide a valid order request." },
      });
    }
    if (limitResult.success) return limitResult.data;

    const fieldErrors = limitResult.error.flatten().fieldErrors;
    const code = fieldErrors.quantity
      ? "INVALID_QUANTITY"
      : fieldErrors.limitPrice
        ? "INVALID_LIMIT_PRICE"
        : "INVALID_ORDER";
    const message =
      code === "INVALID_QUANTITY"
        ? "Quantity must be a positive decimal string."
        : code === "INVALID_LIMIT_PRICE"
          ? "Limit price must be a positive decimal string."
          : "Provide a valid order request.";
    throw new BadRequestException({ error: { code, details: null, message } });
  }

  const marketResult = marketOrderRequestSchema.safeParse(body);
  if (marketResult.success) return marketResult.data;

  const fieldErrors = marketResult.error.flatten().fieldErrors;
  const code = fieldErrors.quantity ? "INVALID_QUANTITY" : "INVALID_ORDER";
  const message =
    code === "INVALID_QUANTITY"
      ? "Quantity must be a positive decimal string."
      : "Provide a valid MARKET order request.";
  throw new BadRequestException({ error: { code, details: null, message } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
      case "INVALID_LIMIT_PRICE":
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
    case "INVALID_LIMIT_PRICE":
      return "Limit price must be a positive decimal string.";
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
