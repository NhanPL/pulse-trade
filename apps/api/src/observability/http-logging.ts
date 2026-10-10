import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import { Catch, HttpException, type ArgumentsHost } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";

import { BackendLogger } from "./backend-logger";
import { requestContext } from "./request-context";

type HttpRequest = IncomingMessage & { route?: { path?: unknown } };

export function createHttpLoggingMiddleware(logger = new BackendLogger("http")) {
  return (request: HttpRequest, response: ServerResponse, next: () => void): void => {
    const context = { requestId: randomUUID() };
    const startedAt = performance.now();
    response.setHeader("X-Request-ID", context.requestId);

    const complete = (aborted: boolean): void => {
      response.off("finish", onFinish);
      response.off("close", onClose);
      requestContext.run(context, () => {
        const metadata = {
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
          method: request.method,
          route: typeof request.route?.path === "string" ? request.route.path : "unmatched",
          ...(aborted ? {} : { status: response.statusCode }),
        };
        if (aborted) logger.warn("http.request_aborted", metadata);
        else if (response.statusCode >= 500) logger.error("http.request_completed", metadata);
        else if (response.statusCode >= 400) logger.warn("http.request_completed", metadata);
        else logger.info("http.request_completed", metadata);
      });
    };
    const onFinish = (): void => complete(false);
    const onClose = (): void => complete(!response.writableFinished);
    response.once("finish", onFinish);
    response.once("close", onClose);
    // Always generate a server ID; client headers cannot spoof correlation or inject log content.
    requestContext.run(context, next);
  };
}

@Catch()
export class LoggingExceptionFilter extends BaseExceptionFilter<unknown> {
  private readonly logger = new BackendLogger("http");

  override handleUnknownError(exception: unknown, host: ArgumentsHost): void {
    const httpError =
      this.isHttpError(exception) &&
      Number.isInteger(exception.statusCode) &&
      exception.statusCode >= 400 &&
      exception.statusCode <= 599;
    const status = httpError ? exception.statusCode : 500;
    if (status >= 500) this.logger.error("http.unexpected_error", { status }, exception);

    // Delegate reply/header handling without invoking Nest's default raw exception logger.
    super.catch(
      new HttpException(
        {
          statusCode: status,
          message: httpError && status < 500 ? exception.message : "Internal server error",
        },
        status,
      ),
      host,
    );
  }
}
