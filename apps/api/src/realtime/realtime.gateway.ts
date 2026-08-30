import { randomUUID } from "node:crypto";

import {
  connectionReadyEventSchema,
  REALTIME_PROTOCOL_VERSION,
  type ConnectionReadyEvent,
} from "@pulse-trade/contracts";
import { Logger } from "@nestjs/common";
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
} from "@nestjs/websockets";
import WebSocket from "ws";

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

  get activeConnectionCount(): number {
    return this.clients.size;
  }
}
