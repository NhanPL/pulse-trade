import { existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isSupportedMarketSymbol } from "../markets/supported-markets";
import { requestContext } from "./request-context";

const EVENTS = [
  "application.ready",
  "application.start_failed",
  "framework.log",
  "framework.warn",
  "framework.error",
  "framework.fatal",
  "http.request_completed",
  "http.request_aborted",
  "http.unexpected_error",
  "market.history_failed",
  "provider.state_changed",
  "provider.socket_closed",
  "provider.socket_error",
  "provider.invalid_message",
  "provider.listener_failed",
  "provider.state_listener_failed",
  "provider.reconnect_scheduled",
  "provider.reconnect_failed",
  "provider.initial_connect_failed",
  "provider.close_failed",
  "realtime.broadcast_failed",
  "realtime.send_failed",
  "realtime.candle_bootstrap_failed",
  "realtime.freshness_listener_failed",
  "realtime.client_connected",
  "realtime.client_disconnected",
  "realtime.client_initialization_failed",
  "realtime.subscription_cleanup_failed",
  "realtime.subscribe_failed",
  "realtime.unsubscribe_failed",
  "orders.subscription_cleanup_failed",
  "orders.evaluation_failed",
  "orders.fill_failed",
  "orders.create_failed",
  "orders.cancel_failed",
] as const;

type LogEvent = (typeof EVENTS)[number];
export type LogLevel = "info" | "warn" | "error" | "fatal";
type LogContext =
  | "bootstrap"
  | "http"
  | "framework"
  | "MarketService"
  | "CoinbaseProvider"
  | "MarketEventBroadcaster"
  | "MarketFreshnessService"
  | "RealtimeGateway"
  | "PendingOrderEvaluator"
  | "OrdersController";

export type LogMetadata = Readonly<{
  activeConnections?: number;
  attempt?: number;
  channel?: string;
  closeCode?: number;
  connectionId?: string;
  delayMs?: number;
  durationMs?: number;
  errorCode?: string;
  frameworkContext?: string;
  interval?: string;
  method?: string;
  orderId?: string;
  orderSide?: string;
  orderType?: string;
  port?: number;
  providerState?: string;
  route?: string;
  status?: number;
  symbol?: string;
}>;

const eventNames = new Set<string>(EVENTS);
const noisyEvents = new Set<LogEvent>([
  "provider.invalid_message",
  "provider.listener_failed",
  "provider.state_listener_failed",
  "realtime.broadcast_failed",
  "realtime.send_failed",
  "realtime.candle_bootstrap_failed",
  "realtime.freshness_listener_failed",
  "orders.evaluation_failed",
  "orders.fill_failed",
]);
const orderErrorCodes = new Set([
  "INSUFFICIENT_BALANCE",
  "INVALID_QUANTITY",
  "INVALID_LIMIT_PRICE",
  "MARKET_DATA_STALE",
  "MARKET_DATA_UNAVAILABLE",
  "ORDER_CONFLICT",
  "UNSUPPORTED_SYMBOL",
  "ORDER_NOT_FOUND",
  "ORDER_NOT_CANCELLABLE",
  "ORDER_UNAVAILABLE",
]);
const frameworkContexts = new Set([
  "NestFactory",
  "InstanceLoader",
  "RoutesResolver",
  "RouterExplorer",
  "NestApplication",
  "WebSocketsController",
  "ExceptionsHandler",
  "WsExceptionsHandler",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const apiRoot = resolve(__dirname, "../..");
export const REALTIME_LOG_INTERVAL_MS = 5_000;

function safeStack(error: unknown): string | undefined {
  try {
    if (!(error instanceof Error) || typeof error.stack !== "string") return undefined;

    // Keep app-owned source coordinates, never the exception message, function names or host paths.
    const frames: string[] = [];
    for (const line of error.stack.slice(0, 12_000).split("\n").slice(1, 41)) {
      const match = line.match(
        /(?:\(|\s)((?:file:\/\/\/|[A-Za-z]:[\\/]|\/)[^\n]*?):(\d{1,7}):(\d{1,7})\)?$/,
      );
      if (!match) continue;
      const path = match[1].startsWith("file:") ? fileURLToPath(match[1]) : match[1];
      const localPath = relative(apiRoot, path).split(sep).join("/");
      if (!/^(?:src|dist)\/[A-Za-z0-9_./-]+\.(?:ts|js)$/.test(localPath)) continue;
      if (localPath.includes("..") || localPath.includes("/generated/") || !existsSync(path))
        continue;
      frames.push(`    at ${localPath}:${match[2]}:${match[3]}`);
      if (frames.length === 10) break;
    }
    return frames.length ? `Error\n${frames.join("\n")}` : undefined;
  } catch {
    return undefined;
  }
}

function metadataFields(metadata: LogMetadata): Record<string, string | number> {
  const fields: Record<string, string | number> = {};
  for (const key of [
    "activeConnections",
    "attempt",
    "closeCode",
    "delayMs",
    "durationMs",
    "port",
    "status",
  ] as const) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) fields[key] = value;
  }
  for (const key of ["connectionId", "orderId"] as const) {
    const value = metadata[key];
    if (typeof value === "string" && uuidPattern.test(value)) fields[key] = value;
  }
  for (const [key, choices] of [
    ["channel", ["ticker", "orderbook", "trades", "candles"]],
    ["interval", ["1m", "5m", "15m", "1h"]],
    ["method", ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]],
    ["orderSide", ["BUY", "SELL"]],
    ["orderType", ["MARKET", "LIMIT"]],
    ["providerState", ["CONNECTED", "DISCONNECTED"]],
  ] as const) {
    const value = metadata[key];
    if (typeof value === "string" && choices.some((choice) => choice === value))
      fields[key] = value;
  }
  if (metadata.errorCode && orderErrorCodes.has(metadata.errorCode))
    fields.errorCode = metadata.errorCode;
  if (metadata.frameworkContext && frameworkContexts.has(metadata.frameworkContext)) {
    fields.frameworkContext = metadata.frameworkContext;
  }
  if (metadata.symbol && isSupportedMarketSymbol(metadata.symbol)) fields.symbol = metadata.symbol;
  // The caller supplies Express's matched template, not URL/query/parameter values.
  if (
    metadata.route &&
    metadata.route.length <= 128 &&
    (metadata.route === "unmatched" || /^\/[A-Za-z0-9_:/-]*$/.test(metadata.route))
  ) {
    fields.route = metadata.route;
  }
  return fields;
}

export type BackendLoggerOptions = Readonly<{
  now?: () => number;
  write?: (line: string, level: LogLevel) => void;
}>;

export class BackendLogger {
  private readonly noisyWindows = new Map<LogEvent, { startedAt: number; suppressed: number }>();
  private readonly now: () => number;
  private readonly write: (line: string, level: LogLevel) => void;

  constructor(
    private readonly context: LogContext,
    options: BackendLoggerOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.write =
      options.write ??
      ((line, level) => {
        (level === "error" || level === "fatal" ? process.stderr : process.stdout).write(
          `${line}\n`,
        );
      });
  }

  info(event: LogEvent, metadata: LogMetadata = {}): void {
    this.emit("info", event, metadata);
  }

  warn(event: LogEvent, metadata: LogMetadata = {}, error?: unknown): void {
    this.emit("warn", event, metadata, error);
  }

  error(event: LogEvent, metadata: LogMetadata = {}, error?: unknown): void {
    this.emit("error", event, metadata, error);
  }

  fatal(event: LogEvent, metadata: LogMetadata = {}, error?: unknown): void {
    this.emit("fatal", event, metadata, error);
  }

  private emit(level: LogLevel, event: LogEvent, metadata: LogMetadata, error?: unknown): void {
    try {
      if (!eventNames.has(event)) return;
      const now = this.now();
      let suppressed = 0;
      if (noisyEvents.has(event)) {
        const window = this.noisyWindows.get(event);
        // Bound repeated feed failures without delaying ingestion or retaining symbols/payloads.
        if (window && now - window.startedAt < REALTIME_LOG_INTERVAL_MS) {
          window.suppressed = Math.min(window.suppressed + 1, Number.MAX_SAFE_INTEGER);
          return;
        }
        suppressed = window?.suppressed ?? 0;
        this.noisyWindows.set(event, { startedAt: now, suppressed: 0 });
      }
      const requestId = requestContext.getStore()?.requestId;
      this.write(
        JSON.stringify({
          timestamp: new Date(now).toISOString(),
          level,
          service: "pulse-trade-api",
          context: this.context,
          event,
          ...(requestId && uuidPattern.test(requestId) ? { requestId } : {}),
          ...metadataFields(metadata),
          ...(suppressed ? { suppressed } : {}),
          ...(error === undefined ? {} : { error: { kind: "exception", stack: safeStack(error) } }),
        }),
        level,
      );
    } catch {
      // Diagnostics must never replace a trading failure, interrupt fan-out or reject an HTTP response.
    }
  }
}
