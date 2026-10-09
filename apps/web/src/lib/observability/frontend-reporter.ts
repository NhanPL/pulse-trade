import { defaultStackParser, type ErrorEvent, type StackFrame } from "@sentry/browser";

const summaries = {
  uncaught_error: "Uncaught frontend error",
  unhandled_rejection: "Unhandled frontend promise rejection",
  route_error: "Page rendering failed",
  root_error: "Application layout failed",
  chart_error: "Chart rendering failed",
  realtime_connection_error: "Realtime connection failed",
  realtime_reconnect_loop: "Realtime reconnect loop detected",
  realtime_consumer_error: "Realtime consumer failed",
  realtime_send_error: "Realtime command failed to send",
} as const;

const errorTypes = ["Error", "TypeError", "RangeError", "ReferenceError"];
const pages = [
  "markets",
  "trade",
  "login",
  "register",
  "portfolio",
  "orders",
  "watchlist",
  "other",
];
const bundlePath = /^\/_next\/static\/(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+\.js$/;

export type FrontendErrorKind = keyof typeof summaries;
export type FrontendErrorSink = (event: ErrorEvent) => void | Promise<void>;

export const REPORT_WINDOW_MS = 60_000;
export const MAX_REPORTS_PER_WINDOW = 10;

export function reportingPage(pathname: string): string {
  if (pathname === "/") return "markets";
  if (/^\/trade\/[^/]+\/?$/.test(pathname)) return "trade";
  if (["/login", "/register", "/portfolio", "/orders", "/watchlist"].includes(pathname)) {
    return pathname.slice(1);
  }
  return "other";
}

function safeFrames(error: unknown, origin: string): StackFrame[] {
  if (!(error instanceof Error) || typeof error.stack !== "string") return [];

  return defaultStackParser(error.stack.slice(0, 12_000))
    .flatMap((frame): StackFrame[] => {
      if (!frame.filename) return [];
      try {
        const url = new URL(frame.filename, origin);
        if (url.origin !== origin || !bundlePath.test(url.pathname)) {
          return [];
        }
        // Preserve bundle coordinates, not function names, hostnames or URL credentials/query.
        return [{ filename: url.pathname, lineno: frame.lineno, colno: frame.colno, in_app: true }];
      } catch {
        return [];
      }
    })
    .slice(-10);
}

export function createFrontendErrorEvent(
  kind: FrontendErrorKind,
  error: unknown,
  pathname: string,
  origin: string,
): ErrorEvent {
  const page = reportingPage(pathname);
  const frames = safeFrames(error, origin);
  const type =
    error instanceof Error && errorTypes.includes(error.name) ? error.name : "FrontendError";
  return buildEvent(kind, type, page, frames);
}

function buildEvent(
  kind: FrontendErrorKind,
  type: string,
  page: string,
  frames: StackFrame[],
): ErrorEvent {
  const lastFrame = frames.at(-1);

  return {
    type: undefined,
    level: kind.startsWith("realtime_") ? "warning" : "error",
    exception: { values: [{ type, value: summaries[kind], stacktrace: { frames } }] },
    tags: { kind, page },
    fingerprint: [
      "pulsetrade-frontend",
      kind,
      page,
      type,
      lastFrame?.filename ?? "unknown-bundle",
      String(lastFrame?.lineno ?? 0),
    ],
  };
}

function isErrorKind(value: unknown): value is FrontendErrorKind {
  return typeof value === "string" && Object.hasOwn(summaries, value);
}

export function sanitizeSdkErrorEvent(event: ErrorEvent): ErrorEvent | null {
  const kind = event.tags?.kind;
  if (!isErrorKind(kind)) return null;
  const page = event.tags?.page;
  const value = event.exception?.values?.[0];
  const type = value?.type;
  const frames = (value?.stacktrace?.frames ?? [])
    .filter((frame) => typeof frame.filename === "string" && bundlePath.test(frame.filename))
    .slice(-10)
    .map((frame): StackFrame => ({
      filename: frame.filename,
      lineno:
        typeof frame.lineno === "number" && Number.isSafeInteger(frame.lineno) && frame.lineno > 0
          ? frame.lineno
          : undefined,
      colno:
        typeof frame.colno === "number" && Number.isSafeInteger(frame.colno) && frame.colno > 0
          ? frame.colno
          : undefined,
      in_app: true,
    }));
  return {
    ...buildEvent(
      kind,
      typeof type === "string" && errorTypes.includes(type) ? type : "FrontendError",
      typeof page === "string" && pages.includes(page) ? page : "other",
      frames,
    ),
    event_id: event.event_id,
    timestamp: event.timestamp,
  };
}

export class FrontendErrorReporter {
  private readonly seenErrors = new WeakSet<Error>();
  private readonly fingerprints = new Set<string>();
  private windowStartedAt = 0;
  private reportCount = 0;

  constructor(
    private readonly sink: FrontendErrorSink,
    private readonly location: () => Readonly<{ origin: string; pathname: string }>,
    private readonly now: () => number = Date.now,
  ) {}

  report(kind: FrontendErrorKind, error?: unknown): void {
    try {
      const now = this.now();
      if (now - this.windowStartedAt >= REPORT_WINDOW_MS || now < this.windowStartedAt) {
        this.windowStartedAt = now;
        this.reportCount = 0;
        this.fingerprints.clear();
      }
      if (this.reportCount >= MAX_REPORTS_PER_WINDOW) return;
      if (error instanceof Error && this.seenErrors.has(error)) return;

      const { origin, pathname } = this.location();
      const event = createFrontendErrorEvent(kind, error, pathname, origin);
      const fingerprint = JSON.stringify(event.fingerprint);
      if (this.fingerprints.has(fingerprint)) return;

      if (error instanceof Error) this.seenErrors.add(error);
      this.fingerprints.add(fingerprint);
      this.reportCount += 1;
      // Diagnostic failures never become unhandled rejections or interrupt the trading UI.
      void Promise.resolve(this.sink(event)).catch(() => undefined);
    } catch {
      // Error objects, browser APIs and the reporting transport are all untrusted here.
    }
  }
}

export function installBrowserErrorListeners(
  target: Window,
  reporter: Pick<FrontendErrorReporter, "report">,
): () => void {
  const onError = (event: ErrorEventInit) => reporter.report("uncaught_error", event.error);
  const onRejection = (event: PromiseRejectionEvent) =>
    reporter.report("unhandled_rejection", event.reason);
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);

  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
