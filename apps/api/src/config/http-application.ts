import type { INestApplication } from "@nestjs/common";

import type { Environment } from "./configuration";
import { createHttpLoggingMiddleware, LoggingExceptionFilter } from "../observability/http-logging";

type ConfigurableHttpApplication = Pick<
  INestApplication,
  "enableCors" | "setGlobalPrefix" | "use" | "useGlobalFilters" | "getHttpAdapter"
>;

/** Configures the browser-facing HTTP boundary in one place for every runtime. */
export function configureHttpApplication(
  app: ConfigurableHttpApplication,
  environment: Environment,
): void {
  app.use(createHttpLoggingMiddleware());
  app.useGlobalFilters(new LoggingExceptionFilter(app.getHttpAdapter()));
  app.enableCors({
    origin: environment.webOrigin,
    credentials: true,
    exposedHeaders: ["X-Request-ID"],
  });
  app.setGlobalPrefix("api/v1");
}
