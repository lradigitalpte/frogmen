import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { RequireActiveOrg } from "@thallesp/nestjs-better-auth";
import { CurrentSecurity } from "./current-security.decorator";
import { MembersService } from "./members.service";
import { RequirePermission } from "./require-permission.decorator";
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

  @Post("invitations")
  invite(
    @CurrentSecurity() context: SecurityContext,
    @Body() body: Parameters<MembersService["invite"]>[1],
  ) {
    return this.membersService.invite(context, body);
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
