import { afterEach, describe, expect, it, vi } from "vitest";

import { RealtimeClient, type RealtimeSocket } from "./RealtimeClient";
import { RealtimeEventRouter } from "./event-router";

class Socket extends EventTarget implements RealtimeSocket {
  readyState: RealtimeSocket["readyState"] = 0;
  close = vi.fn(() => {
    this.readyState = 3;
  });
  send = vi.fn();
  emit(type: "open" | "close" | "error") {
    this.readyState = type === "open" ? 1 : 3;
    this.dispatchEvent(new Event(type));
  }
}

function harness(onDiagnostic = vi.fn()) {
  vi.useFakeTimers();
  const sockets: Socket[] = [];
  const client = new RealtimeClient(
    "ws://localhost/realtime",
    () => {
      const socket = new Socket();
      sockets.push(socket);
      return socket;
    },
    { onDiagnostic, reconnectDelaysMs: [1000], reconnectJitterRatio: 0 },
  );
  return { client, sockets, onDiagnostic };
}

afterEach(() => vi.useRealTimers());

describe("P04 realtime diagnostics", () => {
  it("reports failures and a five-attempt reconnect loop, but not intentional disconnects", () => {
    const { client, sockets, onDiagnostic } = harness();
    client.connect();
    for (let index = 0; index < 5; index++) {
      sockets.at(-1)!.emit("error");
      sockets.at(-1)!.emit("close");
      vi.advanceTimersByTime(1000);
    }
    expect(onDiagnostic.mock.calls.filter(([kind]) => kind === "connection_error")).toHaveLength(5);
    expect(onDiagnostic.mock.calls.filter(([kind]) => kind === "reconnect_loop")).toHaveLength(1);
    sockets.at(-1)!.emit("open");
    vi.advanceTimersByTime(30_000);
    sockets.at(-1)!.emit("close");
    vi.advanceTimersByTime(1000);
    expect(onDiagnostic.mock.calls.filter(([kind]) => kind === "reconnect_loop")).toHaveLength(1);
    const calls = onDiagnostic.mock.calls.length;
    client.disconnect();
    for (const socket of sockets) socket.emit("error");
    vi.advanceTimersByTime(60_000);
    expect(onDiagnostic).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("isolates reporting failure from healthy consumers, send results and socket cleanup", () => {
    const { client, sockets, onDiagnostic } = harness(
      vi.fn(() => {
        throw new Error("reporting unavailable");
      }),
    );
    const healthy = vi.fn();
    const stopBroken = client.onMessage(() => {
      throw new Error("private payload");
    });
    const stopHealthy = client.onMessage(healthy);
    client.connect();
    const socket = sockets[0]!;
    socket.emit("open");
    socket.dispatchEvent(new MessageEvent("message", { data: "private payload" }));
    expect(healthy).toHaveBeenCalledWith("private payload");
    expect(onDiagnostic).toHaveBeenCalledWith("consumer_error");
    socket.send.mockImplementation(() => {
      throw new Error("socket offline");
    });
    expect(client.send("private command")).toBe(false);
    expect(onDiagnostic).toHaveBeenCalledWith("send_error");
    stopBroken();
    stopHealthy();
    expect(() => client.disconnect()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports constructor failures without changing the existing thrown error contract", () => {
    const onDiagnostic = vi.fn();
    const error = new Error("constructor failed");
    const client = new RealtimeClient(
      "ws://localhost/realtime",
      () => {
        throw error;
      },
      { onDiagnostic },
    );
    expect(() => client.connect()).toThrow(error);
    expect(client.connectionState).toBe("DISCONNECTED");
    expect(onDiagnostic.mock.calls).toEqual([["connection_error"]]);
  });

  it("observes normalized router-consumer errors without exposing provider data or blocking other listeners", () => {
    const { client, sockets } = harness();
    const onConsumerError = vi.fn(() => {
      throw new Error("collector offline");
    });
    const router = new RealtimeEventRouter(client, onConsumerError);
    router.onEvent(() => {
      throw new Error("private payload");
    });
    const healthy = vi.fn();
    router.onEvent(healthy);
    client.connect();
    const event = {
      v: 1,
      event: "ticker.update",
      symbol: "BTC-USD",
      ts: 1800000000000,
      data: {
        price: "100",
        change24hPercent: "1.25",
        high24h: "110",
        low24h: "90",
        volume24h: "25",
        marketTs: 1800000000000,
      },
    };
    sockets[0]!.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
    expect(onConsumerError.mock.calls).toEqual([[]]);
    expect(healthy).toHaveBeenCalledWith(event);
    router.destroy();
    client.disconnect();
    expect(vi.getTimerCount()).toBe(0);
  });
});
