import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { registerRequestSchema, type RegisterResponse } from "@pulse-trade/contracts";

import { RegistrationService } from "./registration.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly registration: RegistrationService) {}

  @Post("register")
  register(@Body() body: unknown): Promise<RegisterResponse> {
    const result = registerRequestSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException({
        error: {
          code: "INVALID_REGISTRATION",
          message: "Provide a valid email and a password of 8–128 characters.",
          details: null,
        },
      });
    }
    return this.registration.register(result.data);
  }
}
