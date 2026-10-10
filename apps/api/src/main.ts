import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";

import { AppModule } from "./app.module";
import { loadEnvironment } from "./config/configuration";
import { configureHttpApplication } from "./config/http-application";
import { loadRuntimeEnvironment } from "./config/runtime-environment";
import { BackendLogger } from "./observability/backend-logger";
import { StructuredNestLogger } from "./observability/nest-logger";
import { parseRealtimeMessage } from "./realtime/realtime-message-parser";

async function bootstrap(): Promise<void> {
  loadRuntimeEnvironment();
  const environment = loadEnvironment();
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: new StructuredNestLogger(),
  });
  try {
    app.enableShutdownHooks();
    configureHttpApplication(app, environment);
    app.useWebSocketAdapter(new WsAdapter(app, { messageParser: parseRealtimeMessage }));
    await app.listen(environment.port);
    new BackendLogger("bootstrap").info("application.ready", { port: environment.port });
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  new BackendLogger("bootstrap").fatal("application.start_failed", {}, error);
  process.exitCode = 1;
});
