import { Controller, Get, Query } from "@nestjs/common";
import { RequireActiveOrg } from "@thallesp/nestjs-better-auth";
import { AuditService } from "./audit.service";
import { CurrentSecurity } from "./current-security.decorator";
import { RequirePermission } from "./require-permission.decorator";
import type { SecurityContext } from "./security-context";

@Controller("v1/audit-logs")
@RequireActiveOrg()
@RequirePermission("audit.read")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(
    @CurrentSecurity() context: SecurityContext,
    @Query()
    query: Parameters<AuditService["list"]>[1],
  ) {
    return this.auditService.list(context, query);
  }
}
