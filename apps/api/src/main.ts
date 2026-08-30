import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";

import { AppModule } from "./app.module";
import { loadEnvironment } from "./config/configuration";

async function bootstrap(): Promise<void> {
  const environment = loadEnvironment();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.useWebSocketAdapter(new WsAdapter(app));

  await app.listen(environment.port);
}

void bootstrap();
