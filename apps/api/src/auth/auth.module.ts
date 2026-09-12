import { Module } from "@nestjs/common";

import { PasswordHashService } from "./password-hash.service";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { RegistrationService } from "./registration.service";
import { LoginService } from "./login.service";
import { SessionService } from "./session.service";
import { RefreshService } from "./refresh.service";
import { LogoutService } from "./logout.service";
import { CurrentUserService } from "./current-user.service";
import { MeController } from "./me.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, MeController],
  providers: [
    PasswordHashService,
    RegistrationService,
    LoginService,
    SessionService,
    RefreshService,
    LogoutService,
    CurrentUserService,
  ],
  exports: [PasswordHashService],
})
export class AuthModule {}
