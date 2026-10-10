import { Controller, Get, Header } from "@nestjs/common";

export type HealthResponse = Readonly<{ data: Readonly<{ status: "ok" }> }>;

@Controller("health")
export class HealthController {
  @Get()
  @Header("Cache-Control", "no-store")
  getHealth(): HealthResponse {
    // Liveness must not depend on PostgreSQL or the upstream exchange recovering.
    return { data: { status: "ok" } };
  }
}
