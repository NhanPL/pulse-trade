import { randomUUID } from "node:crypto";

import {
  connectionReadyEventSchema,
  errorEventSchema,
  REALTIME_PROTOCOL_VERSION,
  subscribeCommandSchema,
  subscriptionAckEventSchema,
  unsubscribeCommandSchema,
  type ConnectionReadyEvent,
  type ErrorEvent,
  type SubscriptionAckEvent,
} from "@pulse-trade/contracts";
import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import WebSocket from "ws";

import { isSupportedMarketSymbol } from "../markets/supported-markets";
import { SubscriptionRegistry } from "./subscription-registry.service";

export const REALTIME_PATH = "/realtime";
export const REALTIME_MAX_PAYLOAD_BYTES = 64 * 1_024;

type SubscriptionCommandResponse = SubscriptionAckEvent | ErrorEvent;

@WebSocketGateway({
  maxPayload: REALTIME_MAX_PAYLOAD_BYTES,
  path: REALTIME_PATH,
  perMessageDeflate: false,
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly subscriptionRegistry: SubscriptionRegistry) {}

  handleConnection(client: WebSocket): void {
    this.subscriptionRegistry.registerClient(client);

    const event: ConnectionReadyEvent = connectionReadyEventSchema.parse({
      data: { connectionId: randomUUID() },
      event: "connection.ready",
      ts: Date.now(),
      v: REALTIME_PROTOCOL_VERSION,
    });

    try {
      client.send(JSON.stringify(event));
    } catch {
      this.logger.warn("Failed to initialize realtime client connection");
      this.subscriptionRegistry.removeClient(client);
      client.close(1011, "Connection initialization failed");
    }
  }

  handleDisconnect(client: WebSocket): void {
    try {
      this.subscriptionRegistry.removeClient(client);
    } catch {
      this.logger.warn("Failed to release upstream subscriptions for disconnected client");
    }
  }

  @SubscribeMessage("subscribe")
  handleSubscribe(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: unknown,
  ): SubscriptionCommandResponse | undefined {
    const result = subscribeCommandSchema.safeParse(payload);
    if (!result.success) return undefined;

    const unsupportedSymbolError = this.createUnsupportedSymbolError(
      result.data.requestId,
      result.data.symbols,
    );
    if (unsupportedSymbolError) return unsupportedSymbolError;

    try {
      this.subscriptionRegistry.subscribe(client, result.data);
    } catch {
      this.logger.warn("Failed to register realtime subscription");
      return this.createErrorResponse(
        result.data.requestId,
        "SUBSCRIPTION_FAILED",
        "Realtime subscription could not be registered.",
      );
    }

    return this.createAcknowledgement(result.data.requestId);
  }

  @SubscribeMessage("unsubscribe")
  handleUnsubscribe(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: unknown,
  ): SubscriptionCommandResponse | undefined {
    const result = unsubscribeCommandSchema.safeParse(payload);
    if (!result.success) return undefined;

    const unsupportedSymbolError = this.createUnsupportedSymbolError(
      result.data.requestId,
      result.data.symbols,
    );
    if (unsupportedSymbolError) return unsupportedSymbolError;

    try {
      this.subscriptionRegistry.unsubscribe(client, result.data);
    } catch {
      this.logger.warn("Failed to unregister realtime subscription");
      return this.createErrorResponse(
        result.data.requestId,
        "UNSUBSCRIPTION_FAILED",
        "Realtime subscription could not be removed.",
      );
    }

    return this.createAcknowledgement(result.data.requestId);
  }

  get activeConnectionCount(): number {
    return this.subscriptionRegistry.activeClientCount;
  }

  private createAcknowledgement(requestId: string): SubscriptionAckEvent {
    return subscriptionAckEventSchema.parse({
      data: {
        accepted: true,
        requestId,
      },
      event: "subscription.ack",
      ts: Date.now(),
      v: REALTIME_PROTOCOL_VERSION,
    });
  }

  private createErrorResponse(requestId: string, code: string, message: string): ErrorEvent {
    return errorEventSchema.parse({
      data: { code, message, requestId },
      event: "error",
      ts: Date.now(),
      v: REALTIME_PROTOCOL_VERSION,
    });
  }

  private createUnsupportedSymbolError(
    requestId: string,
    symbols: readonly string[],
  ): ErrorEvent | undefined {
    const unsupportedSymbol = symbols.find((symbol) => !isSupportedMarketSymbol(symbol));

    if (unsupportedSymbol) {
      return this.createErrorResponse(
        requestId,
        "UNSUPPORTED_SYMBOL",
        `Unsupported market symbol: ${unsupportedSymbol}.`,
      );
    }
  }
}
