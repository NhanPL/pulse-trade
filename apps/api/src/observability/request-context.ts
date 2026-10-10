import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = Readonly<{ requestId: string }>;

export const requestContext = new AsyncLocalStorage<RequestContext>();
