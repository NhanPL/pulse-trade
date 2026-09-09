import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";

import { AppModule } from "./app.module";
import { loadEnvironment } from "./config/configuration";
import { configureHttpApplication } from "./config/http-application";
import { parseRealtimeMessage } from "./realtime/realtime-message-parser";

async function bootstrap(): Promise<void> {
  const environment = loadEnvironment();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  configureHttpApplication(app, environment);
  app.useWebSocketAdapter(new WsAdapter(app, { messageParser: parseRealtimeMessage }));

  await app.listen(environment.port);
}

void bootstrap();
