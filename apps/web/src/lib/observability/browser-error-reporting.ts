import { BrowserClient, defaultStackParser, makeFetchTransport, Scope } from "@sentry/browser";

import { webEnvironment } from "../env/server";
import {
  FrontendErrorReporter,
  installBrowserErrorListeners,
  sanitizeSdkErrorEvent,
  type FrontendErrorKind,
} from "./frontend-reporter";

let reporter: FrontendErrorReporter | undefined;
let initialized = false;

export function initializeFrontendErrorReporting(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  if (process.env.NODE_ENV !== "production" || !webEnvironment.NEXT_PUBLIC_SENTRY_DSN) return;

  try {
    const client = new BrowserClient({
      dsn: webEnvironment.NEXT_PUBLIC_SENTRY_DSN,
      environment: "production",
      release: webEnvironment.NEXT_PUBLIC_APP_RELEASE,
      // No global SDK, automatic breadcrumbs, request context, sessions, replay or tracing.
      integrations: [],
      stackParser: defaultStackParser,
      transport: (options) =>
        makeFetchTransport({
          ...options,
          bufferSize: 10,
          fetchOptions: { credentials: "omit", referrerPolicy: "no-referrer" },
        }),
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
        frameContextLines: 0,
      },
      sendClientReports: false,
      beforeSend: (event) => {
        const safe = sanitizeSdkErrorEvent(event);
        return safe
          ? { ...safe, environment: "production", release: webEnvironment.NEXT_PUBLIC_APP_RELEASE }
          : null;
      },
    });
    const scope = new Scope();
    scope.setClient(client);
    client.init();
    reporter = new FrontendErrorReporter(
      (event) => {
        scope.captureEvent(event);
      },
      () => window.location,
    );
    // Instrumentation owns these two listeners for the document lifetime, not per route.
    installBrowserErrorListeners(window, reporter);
  } catch {
    // Monitoring is optional; initialization must never prevent application startup.
  }
}

export function reportFrontendError(kind: FrontendErrorKind, error?: unknown): void {
  initializeFrontendErrorReporting();
  reporter?.report(kind, error);
}
