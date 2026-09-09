import { Module } from "@nestjs/common";

import { PasswordHashService } from "./password-hash.service";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { RegistrationService } from "./registration.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [PasswordHashService, RegistrationService],
  exports: [PasswordHashService],
})
export class AuthModule {}
