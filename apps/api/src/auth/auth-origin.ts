import { ForbiddenException } from "@nestjs/common";

export function assertAuthOrigin(origin: string | undefined): void {
  // Browser auth mutations must come from the configured web app; CLI clients may omit Origin.
  if (origin !== undefined && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) {
    throw new ForbiddenException({
      error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed.", details: null },
    });
  }
}
