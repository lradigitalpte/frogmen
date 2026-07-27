import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { MailModule } from "../mail/mail.module";
import { AuditController } from "./audit.controller";
import { AuditInterceptor } from "./audit.interceptor";
import { AuditService } from "./audit.service";
import { BranchesController } from "./branches.controller";
import { BranchesService } from "./branches.service";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";
import { PermissionGuard } from "./permission.guard";
import { RlsContextInterceptor } from "./rls-context.interceptor";
import { SecurityContextService } from "./security-context.service";

@Module({
  imports: [MailModule],
  controllers: [BranchesController, MembersController, AuditController],
  providers: [
    SecurityContextService,
    BranchesService,
    MembersService,
    AuditService,
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: RlsContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [SecurityContextService],
})
export class SecurityModule {}
