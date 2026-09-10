import { Module } from "@nestjs/common";

import { PasswordHashService } from "./password-hash.service";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { RegistrationService } from "./registration.service";
import { LoginService } from "./login.service";
import { SessionService } from "./session.service";
import { RefreshService } from "./refresh.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    PasswordHashService,
    RegistrationService,
    LoginService,
    SessionService,
    RefreshService,
  ],
  exports: [PasswordHashService],
})
export class AuthModule {}
