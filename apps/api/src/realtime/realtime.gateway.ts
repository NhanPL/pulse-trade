import { randomUUID } from "node:crypto";

import {
  connectionReadyEventSchema,
  errorEventSchema,
  REALTIME_PROTOCOL_VERSION,
  subscribeCommandSchema,
  subscriptionAckEventSchema,
  type ConnectionReadyEvent,
  type ErrorEvent,
  type SubscriptionAckEvent,
} from "@pulse-trade/contracts";
import { Logger } from "@nestjs/common";
import {
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import WebSocket from "ws";

import { isSupportedMarketSymbol } from "../markets/supported-markets";

export const REALTIME_PATH = "/realtime";
export const REALTIME_MAX_PAYLOAD_BYTES = 64 * 1_024;

@WebSocketGateway({
  maxPayload: REALTIME_MAX_PAYLOAD_BYTES,
  path: REALTIME_PATH,
  perMessageDeflate: false,
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly clients = new Set<WebSocket>();
  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: WebSocket): void {
    this.clients.add(client);

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
      this.clients.delete(client);
      client.close(1011, "Connection initialization failed");
    }
  }

  handleDisconnect(client: WebSocket): void {
    this.clients.delete(client);
  }

  @SubscribeMessage("subscribe")
  handleSubscribe(@MessageBody() payload: unknown): SubscriptionAckEvent | ErrorEvent | undefined {
    const result = subscribeCommandSchema.safeParse(payload);
    if (!result.success) return undefined;

    const unsupportedSymbol = result.data.symbols.find(
      (symbol) => !isSupportedMarketSymbol(symbol),
    );

    if (unsupportedSymbol) {
      return errorEventSchema.parse({
        data: {
          code: "UNSUPPORTED_SYMBOL",
          message: `Unsupported market symbol: ${unsupportedSymbol}.`,
          requestId: result.data.requestId,
        },
        event: "error",
        ts: Date.now(),
        v: REALTIME_PROTOCOL_VERSION,
      });
    }

    return subscriptionAckEventSchema.parse({
      data: {
        accepted: true,
        requestId: result.data.requestId,
      },
      event: "subscription.ack",
      ts: Date.now(),
      v: REALTIME_PROTOCOL_VERSION,
    });
  }

  get activeConnectionCount(): number {
    return this.clients.size;
  }
}
