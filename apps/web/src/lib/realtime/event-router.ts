import { realtimeEventSchema, type RealtimeEvent } from "@pulse-trade/contracts";

import type { RealtimeMessageListener } from "./RealtimeClient";

export type RealtimeEventListener = (event: RealtimeEvent) => void;

export type RealtimeMessageSource = Readonly<{
  onMessage(listener: RealtimeMessageListener): () => void;
}>;

export function parseRealtimeEvent(message: unknown): RealtimeEvent | undefined {
  if (typeof message !== "string") return undefined;

  try {
    const payload: unknown = JSON.parse(message);
    const result = realtimeEventSchema.safeParse(payload);

    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export class RealtimeEventRouter {
  private readonly eventListeners = new Set<RealtimeEventListener>();
  private readonly removeMessageListener: () => void;

  constructor(messageSource: RealtimeMessageSource) {
    this.removeMessageListener = messageSource.onMessage((message) => this.route(message));
  }

  destroy(): void {
    this.removeMessageListener();
    this.eventListeners.clear();
  }

  onEvent(listener: RealtimeEventListener): () => void {
    this.eventListeners.add(listener);

    return () => this.eventListeners.delete(listener);
  }

  private route(message: unknown): void {
    const event = parseRealtimeEvent(message);
    if (!event) return;

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // A store consumer must not prevent other realtime consumers from updating.
      }
    }
  }
}
