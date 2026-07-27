import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { BranchesService } from "./branches.service";
import { CurrentSecurity } from "./current-security.decorator";
import { RequirePermission } from "./require-permission.decorator";
import type { SecurityContext } from "./security-context";

@Controller("v1/branches")
@RequireActiveOrg()
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  list(@CurrentSecurity() context: SecurityContext) {
    return this.branchesService.list(context.organizationId);
  }

  @Post()
  @RequirePermission("branches.manage")
  create(
    @CurrentSecurity() context: SecurityContext,
    @Body() body: Parameters<BranchesService["create"]>[1],
  ) {
    return this.branchesService.create(context, body);
  }

  @Patch(":id")
  @RequirePermission("branches.manage")
  update(
    @CurrentSecurity() context: SecurityContext,
    @Param("id") id: string,
    @Body() body: Parameters<BranchesService["update"]>[2],
  ) {
    return this.branchesService.update(context, id, body);
  }

  @Delete(":id")
  @RequirePermission("branches.manage")
  deactivate(
    @CurrentSecurity() context: SecurityContext,
    @Param("id") id: string,
  ) {
    return this.branchesService.deactivate(context, id);
  }

  @Post("select")
  @RequirePermission("organization.read")
  select(
    @CurrentSecurity() context: SecurityContext,
    @Session() session: UserSession,
    @Body() body: { mode?: string; branchId?: string | null },
  ) {
    return this.branchesService.selectScope(context, session.session.id, body);
  }
}
