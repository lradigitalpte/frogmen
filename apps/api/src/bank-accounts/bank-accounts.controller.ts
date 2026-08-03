import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { RequireActiveOrg } from "@thallesp/nestjs-better-auth";
import { BankAccountsService } from "./bank-accounts.service";
import { CurrentSecurity } from "../security/current-security.decorator";
import { RequirePermission } from "../security/require-permission.decorator";
import type { SecurityContext } from "../security/security-context";

@Controller("v1/bank-accounts")
@RequireActiveOrg()
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  @RequirePermission("accounting.read")
  list(
    @CurrentSecurity() context: SecurityContext,
    @Query("branchId") branchId?: string,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.bankAccountsService.list(context.organizationId, {
      branchId: branchId || context.activeBranchId,
      activeOnly: activeOnly !== "false",
    });
  }

  @Get(":id")
  @RequirePermission("accounting.read")
  get(@CurrentSecurity() context: SecurityContext, @Param("id") id: string) {
    return this.bankAccountsService.getById(context.organizationId, id);
  }

  @Post()
  @RequirePermission("accounting.manage")
  create(
    @CurrentSecurity() context: SecurityContext,
    @Body() body: Parameters<BankAccountsService["create"]>[1],
  ) {
    return this.bankAccountsService.create(context, body);
  }

  @Patch(":id")
  @RequirePermission("accounting.manage")
  update(
    @CurrentSecurity() context: SecurityContext,
    @Param("id") id: string,
    @Body() body: Parameters<BankAccountsService["update"]>[2],
  ) {
    return this.bankAccountsService.update(context, id, body);
  }

  @Delete(":id")
  @RequirePermission("accounting.manage")
  deactivate(
    @CurrentSecurity() context: SecurityContext,
    @Param("id") id: string,
  ) {
    return this.bankAccountsService.deactivate(context, id);
  }
}
