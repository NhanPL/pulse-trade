import type { LoggerService } from "@nestjs/common";

import { BackendLogger } from "./backend-logger";

export class StructuredNestLogger implements LoggerService {
  constructor(private readonly logger = new BackendLogger("framework")) {}

  log(_message: unknown, ...params: unknown[]): void {
    this.logger.info("framework.log", this.context(params));
  }

  warn(_message: unknown, ...params: unknown[]): void {
    this.logger.warn("framework.warn", this.context(params));
  }

  error(message: unknown, ...params: unknown[]): void {
    this.logger.error("framework.error", this.context(params), message);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.logger.fatal("framework.fatal", this.context(params), message);
  }

  debug(): void {}
  verbose(): void {}

  private context(params: unknown[]): { frameworkContext?: string } {
    // Framework messages/objects can embed SQL, credentials or request data; never serialize them.
    const context = params.at(-1);
    return typeof context === "string" ? { frameworkContext: context } : {};
  }
}
