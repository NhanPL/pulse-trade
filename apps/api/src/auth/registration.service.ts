import { ConflictException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { RegisterRequest, RegisterResponse } from "@pulse-trade/contracts";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { PasswordHashService } from "./password-hash.service";

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordHashService,
  ) {}

  async register(input: RegisterRequest): Promise<RegisterResponse> {
    try {
      const client = this.prisma.client;
      // Hash before taking a transaction/connection; never hold a DB lock for hashing.
      const passwordHash = await this.passwords.hash(input.password);
      const user = await client.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: { email: input.email, passwordHash },
          select: { id: true, email: true },
        });
        await transaction.walletBalance.create({
          data: { userId: created.id, asset: "USD", available: "10000", locked: "0" },
        });
        return created;
      });
      return { data: { user } };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          error: {
            code: "EMAIL_ALREADY_REGISTERED",
            message: "Email is already registered.",
            details: null,
          },
        });
      }
      // Do not let Prisma errors containing queries/hash values reach Nest's logger.
      throw new ServiceUnavailableException({
        error: {
          code: "REGISTRATION_UNAVAILABLE",
          message: "Registration is unavailable. Please try again later.",
          details: null,
        },
      });
    }
  }
}
