import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { RequireActiveOrg } from "@thallesp/nestjs-better-auth";
import { CurrentSecurity } from "./current-security.decorator";
import { MembersService } from "./members.service";
import { RequirePermission } from "./require-permission.decorator";
import { ROLE_PERMISSIONS, ROLES } from "./permissions";
import type { SecurityContext } from "./security-context";

@Controller("v1/members")
@RequireActiveOrg()
@RequirePermission("members.manage")
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  list(@CurrentSecurity() context: SecurityContext) {
    return this.membersService.list(context.organizationId);
  }

  /** The fixed role → permission table, so the UI shows exactly what the API enforces. */
  @Get("roles")
  roles() {
    return ROLES.map((role) => ({ role, permissions: ROLE_PERMISSIONS[role] }));
  }

  /** Names for "assign to" pickers — any member, not just admins. */
  @Get("directory")
  @RequirePermission("organization.read")
  directory(@CurrentSecurity() context: SecurityContext) {
    return this.membersService.directory(context.organizationId);
  }

  @Get("invitations")
  listInvitations(@CurrentSecurity() context: SecurityContext) {
    return this.membersService.listInvitations(context.organizationId);
  }

  @Patch(":id")
  update(
    @CurrentSecurity() context: SecurityContext,
    @Param("id") id: string,
    @Body() body: Parameters<MembersService["update"]>[2],
  ) {
    return this.membersService.update(context, id, body);
  }

  @Delete(":id")
  remove(@CurrentSecurity() context: SecurityContext, @Param("id") id: string) {
    return this.membersService.remove(context, id);
  }

  @Post("invitations")
  invite(
    @CurrentSecurity() context: SecurityContext,
    @Body() body: Parameters<MembersService["invite"]>[1],
  ) {
    return this.membersService.invite(context, body);
  }

  @Post("provision")
  provision(
    @CurrentSecurity() context: SecurityContext,
    @Body() body: Parameters<MembersService["provisionUser"]>[1],
  ) {
    return this.membersService.provisionUser(context, body);
  }

  @Delete("invitations/:id")
  cancel(
    @CurrentSecurity() context: SecurityContext,
    @Param("id") id: string,
  ) {
    return this.membersService.cancelInvitation(context, id);
  }

  @Post("invitations/:id/resend")
  resend(
    @CurrentSecurity() context: SecurityContext,
    @Param("id") id: string,
  ) {
    return this.membersService.resendInvitation(context, id);
  }
}
