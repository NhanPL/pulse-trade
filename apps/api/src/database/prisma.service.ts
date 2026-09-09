import { Injectable, ServiceUnavailableException, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private instance?: PrismaClient;

  get client(): PrismaClient {
    if (!this.instance) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new ServiceUnavailableException({
          error: {
            code: "REGISTRATION_UNAVAILABLE",
            message: "Registration is unavailable.",
            details: null,
          },
        });
      }

      // Public market data can run without a DB; create one shared pool on first use.
      this.instance = new PrismaClient({
        adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }),
      });
    }
    return this.instance;
  }

  async onModuleDestroy(): Promise<void> {
    await this.instance?.$disconnect();
  }
}
