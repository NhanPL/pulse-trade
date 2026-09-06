export type RealtimeConnectionState = "CONNECTING" | "CONNECTED" | "RECONNECTING" | "DISCONNECTED";

export type RealtimeConnectionStateListener = (state: RealtimeConnectionState) => void;

export type RealtimeSocket = Pick<
  WebSocket,
  "addEventListener" | "close" | "readyState" | "removeEventListener" | "send"
>;

export type RealtimeSocketFactory = (url: string) => RealtimeSocket;

export type RealtimeClientOptions = Readonly<{
  clearTimeout?: typeof clearTimeout;
  random?: () => number;
  reconnectDelaysMs?: readonly number[];
  reconnectJitterRatio?: number;
  setTimeout?: typeof setTimeout;
  stableConnectionMs?: number;
}>;

type SocketListeners = Readonly<{
  close: EventListener;
  error: EventListener;
  open: EventListener;
}>;

const SOCKET_CLOSING = 2;
const SOCKET_OPEN = 1;
const NORMAL_CLOSURE_CODE = 1_000;
const NORMAL_CLOSURE_REASON = "Client disconnect";

export const REALTIME_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000] as const;
export const REALTIME_RECONNECT_JITTER_RATIO = 0.2;
export const REALTIME_STABLE_CONNECTION_MS = 30_000;

const createBrowserSocket: RealtimeSocketFactory = (url) => new WebSocket(url);

export function calculateReconnectDelayMs(
  attempt: number,
  delaysMs: readonly number[] = REALTIME_RECONNECT_DELAYS_MS,
  jitterRatio = REALTIME_RECONNECT_JITTER_RATIO,
  randomValue = Math.random(),
): number {
  if (delaysMs.length === 0 || delaysMs.some((delay) => !Number.isFinite(delay) || delay < 0)) {
    throw new Error("Realtime reconnect delays must contain non-negative finite values");
  }

  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
    throw new Error("Realtime reconnect jitter ratio must be between 0 and 1");
  }

  const normalizedAttempt = Number.isFinite(attempt) ? Math.max(0, Math.trunc(attempt)) : 0;
  const baseDelay = delaysMs[Math.min(normalizedAttempt, delaysMs.length - 1)]!;
  const normalizedRandomValue = Number.isFinite(randomValue)
    ? Math.min(1, Math.max(0, randomValue))
    : 0.5;
  const jitter = baseDelay * jitterRatio * (normalizedRandomValue * 2 - 1);
  const maximumDelay = Math.max(...delaysMs);

  return Math.min(maximumDelay, Math.max(0, Math.round(baseDelay + jitter)));
}

export class RealtimeClient {
  private readonly cancelTimeout: typeof clearTimeout;
  private readonly connectionStateListeners = new Set<RealtimeConnectionStateListener>();
  private readonly random: () => number;
  private readonly reconnectDelaysMs: readonly number[];
  private readonly reconnectJitterRatio: number;
  private readonly scheduleTimeout: typeof setTimeout;
  private readonly stableConnectionMs: number;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private shouldReconnect = false;
  private socket: RealtimeSocket | undefined;
  private socketListeners: SocketListeners | undefined;
  private stableConnectionTimer: ReturnType<typeof setTimeout> | undefined;
  private state: RealtimeConnectionState = "DISCONNECTED";

  constructor(
    private readonly url: string,
    private readonly socketFactory: RealtimeSocketFactory = createBrowserSocket,
    options: RealtimeClientOptions = {},
  ) {
    this.cancelTimeout = options.clearTimeout ?? clearTimeout;
    this.random = options.random ?? Math.random;
    this.reconnectDelaysMs = options.reconnectDelaysMs ?? REALTIME_RECONNECT_DELAYS_MS;
    this.reconnectJitterRatio = options.reconnectJitterRatio ?? REALTIME_RECONNECT_JITTER_RATIO;
    this.scheduleTimeout = options.setTimeout ?? setTimeout;
    this.stableConnectionMs = options.stableConnectionMs ?? REALTIME_STABLE_CONNECTION_MS;

    calculateReconnectDelayMs(0, this.reconnectDelaysMs, this.reconnectJitterRatio, 0.5);
    if (!Number.isFinite(this.stableConnectionMs) || this.stableConnectionMs < 0) {
      throw new Error("Realtime stable connection duration must be a non-negative finite value");
    }
  }

  get connectionState(): RealtimeConnectionState {
    return this.state;
  }

  connect(): void {
    if (this.shouldReconnect || this.socket) return;

    this.shouldReconnect = true;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.setConnectionState("CONNECTING");

    try {
      this.openSocket();
    } catch (error) {
      this.shouldReconnect = false;
      this.setConnectionState("DISCONNECTED");
      throw error;
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.clearStableConnectionTimer();

    const socket = this.socket;
    if (!socket) {
      this.setConnectionState("DISCONNECTED");
      return;
    }

    this.releaseSocket(socket);

    if (socket.readyState < SOCKET_CLOSING) {
      try {
        socket.close(NORMAL_CLOSURE_CODE, NORMAL_CLOSURE_REASON);
      } catch {
        // State and listeners are already released even if the browser rejects close().
      }
    }
  }

  onConnectionState(listener: RealtimeConnectionStateListener): () => void {
    this.connectionStateListeners.add(listener);
    this.notifyConnectionStateListener(listener, this.state);

    return () => this.connectionStateListeners.delete(listener);
  }

  send(payload: string): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== SOCKET_OPEN) return false;

    try {
      socket.send(payload);
      return true;
    } catch {
      return false;
    }
  }

  private attachSocketListeners(socket: RealtimeSocket): void {
    const listeners: SocketListeners = {
      close: () => this.handleUnexpectedDisconnect(socket),
      error: () => this.handleSocketError(socket),
      open: () => {
        if (this.socket !== socket) return;

        this.setConnectionState("CONNECTED");
        this.startStableConnectionTimer(socket);
      },
    };

    this.socketListeners = listeners;
    socket.addEventListener("close", listeners.close);
    socket.addEventListener("error", listeners.error);
    socket.addEventListener("open", listeners.open);
  }

  private detachSocketListeners(socket: RealtimeSocket): void {
    const listeners = this.socketListeners;
    if (!listeners) return;

    socket.removeEventListener("close", listeners.close);
    socket.removeEventListener("error", listeners.error);
    socket.removeEventListener("open", listeners.open);
    this.socketListeners = undefined;
  }

  private handleSocketError(socket: RealtimeSocket): void {
    if (this.socket !== socket) return;

    this.handleUnexpectedDisconnect(socket);
    if (socket.readyState >= SOCKET_CLOSING) return;

    try {
      socket.close();
    } catch {
      // The connection is already considered closed locally.
    }
  }

  private handleUnexpectedDisconnect(socket: RealtimeSocket): void {
    if (this.socket !== socket) return;

    this.releaseSocket(socket, this.shouldReconnect ? "RECONNECTING" : "DISCONNECTED");
    this.clearStableConnectionTimer();

    if (this.shouldReconnect) this.scheduleReconnect();
  }

  private openSocket(): void {
    const socket = this.socketFactory(this.url);
    this.socket = socket;
    this.attachSocketListeners(socket);
  }

  private releaseSocket(
    socket: RealtimeSocket,
    nextState: RealtimeConnectionState = "DISCONNECTED",
  ): void {
    if (this.socket !== socket) return;

    this.detachSocketListeners(socket);
    this.socket = undefined;
    this.setConnectionState(nextState);
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.socket || this.reconnectTimer !== undefined) return;

    const delayMs = calculateReconnectDelayMs(
      this.reconnectAttempt,
      this.reconnectDelaysMs,
      this.reconnectJitterRatio,
      this.random(),
    );
    this.reconnectAttempt += 1;
    this.setConnectionState("RECONNECTING");

    this.reconnectTimer = this.scheduleTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.shouldReconnect) return;

      try {
        this.openSocket();
      } catch {
        this.scheduleReconnect();
      }
    }, delayMs);
  }

  private startStableConnectionTimer(socket: RealtimeSocket): void {
    this.clearStableConnectionTimer();

    this.stableConnectionTimer = this.scheduleTimeout(() => {
      this.stableConnectionTimer = undefined;

      if (this.socket === socket && this.state === "CONNECTED") {
        this.reconnectAttempt = 0;
      }
    }, this.stableConnectionMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === undefined) return;

    this.cancelTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private clearStableConnectionTimer(): void {
    if (this.stableConnectionTimer === undefined) return;

    this.cancelTimeout(this.stableConnectionTimer);
    this.stableConnectionTimer = undefined;
  }

  private setConnectionState(state: RealtimeConnectionState): void {
    if (this.state === state) return;

    this.state = state;
    for (const listener of this.connectionStateListeners) {
      this.notifyConnectionStateListener(listener, state);
    }
  }

  private notifyConnectionStateListener(
    listener: RealtimeConnectionStateListener,
    state: RealtimeConnectionState,
  ): void {
    try {
      listener(state);
    } catch {
      // One consumer must not interrupt socket cleanup or other state listeners.
    }
  }
}
