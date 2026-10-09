import { webEnvironment } from "../env/server";
import { reportFrontendError } from "../observability/browser-error-reporting";
import { RealtimeClient } from "./RealtimeClient";
import { RealtimeEventRouter } from "./event-router";
import { RealtimeSubscriptionManager } from "./subscription-manager";

export type RealtimeRuntime = Readonly<{
  client: RealtimeClient;
  eventRouter: RealtimeEventRouter;
  subscriptions: RealtimeSubscriptionManager;
}>;

let browserRealtimeRuntime: RealtimeRuntime | undefined;

export function createRealtimeRuntime(webSocketUrl: string): RealtimeRuntime {
  const client = new RealtimeClient(webSocketUrl, undefined, {
    onDiagnostic: (kind) => reportFrontendError(`realtime_${kind}`),
  });
  const eventRouter = new RealtimeEventRouter(client, () =>
    reportFrontendError("realtime_consumer_error"),
  );
  const subscriptions = new RealtimeSubscriptionManager(client);

  return { client, eventRouter, subscriptions };
}

export function getBrowserRealtimeRuntime(): RealtimeRuntime {
  if (typeof window === "undefined") {
    throw new Error("Realtime runtime can only be created in the browser");
  }

  browserRealtimeRuntime ??= createRealtimeRuntime(webEnvironment.NEXT_PUBLIC_WS_URL);
  return browserRealtimeRuntime;
}
