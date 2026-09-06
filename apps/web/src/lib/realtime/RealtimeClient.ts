export type RealtimeConnectionState = "CONNECTING" | "CONNECTED" | "RECONNECTING" | "DISCONNECTED";

export type RealtimeConnectionStateListener = (state: RealtimeConnectionState) => void;

export type RealtimeSocket = Pick<
  WebSocket,
  "addEventListener" | "close" | "readyState" | "removeEventListener"
>;

export type RealtimeSocketFactory = (url: string) => RealtimeSocket;

type SocketListeners = Readonly<{
  close: EventListener;
  error: EventListener;
  open: EventListener;
}>;

const SOCKET_CLOSING = 2;
const NORMAL_CLOSURE_CODE = 1_000;
const NORMAL_CLOSURE_REASON = "Client disconnect";

const createBrowserSocket: RealtimeSocketFactory = (url) => new WebSocket(url);

export class RealtimeClient {
  private readonly connectionStateListeners = new Set<RealtimeConnectionStateListener>();
  private socket: RealtimeSocket | undefined;
  private socketListeners: SocketListeners | undefined;
  private state: RealtimeConnectionState = "DISCONNECTED";

  constructor(
    private readonly url: string,
    private readonly socketFactory: RealtimeSocketFactory = createBrowserSocket,
  ) {}

  get connectionState(): RealtimeConnectionState {
    return this.state;
  }

  connect(): void {
    if (this.socket || this.state === "CONNECTING" || this.state === "CONNECTED") return;

    this.setConnectionState("CONNECTING");

    let socket: RealtimeSocket;
    try {
      socket = this.socketFactory(this.url);
    } catch (error) {
      this.setConnectionState("DISCONNECTED");
      throw error;
    }

    this.socket = socket;
    this.attachSocketListeners(socket);
  }

  disconnect(): void {
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

  private attachSocketListeners(socket: RealtimeSocket): void {
    const listeners: SocketListeners = {
      close: () => this.releaseSocket(socket),
      error: () => this.handleSocketError(socket),
      open: () => {
        if (this.socket === socket) this.setConnectionState("CONNECTED");
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

    this.releaseSocket(socket);
    if (socket.readyState >= SOCKET_CLOSING) return;

    try {
      socket.close();
    } catch {
      // The connection is already considered closed locally.
    }
  }

  private releaseSocket(socket: RealtimeSocket): void {
    if (this.socket !== socket) return;

    this.detachSocketListeners(socket);
    this.socket = undefined;
    this.setConnectionState("DISCONNECTED");
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
