import type { INestApplication } from "@nestjs/common";

import type { Environment } from "./configuration";

type ConfigurableHttpApplication = Pick<INestApplication, "enableCors" | "setGlobalPrefix">;

/** Configures the browser-facing HTTP boundary in one place for every runtime. */
export function configureHttpApplication(
  app: ConfigurableHttpApplication,
  environment: Environment,
): void {
  app.enableCors({ origin: environment.webOrigin, credentials: true });
  app.setGlobalPrefix("api/v1");
}
