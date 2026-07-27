import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { WarrantyPoliciesService } from "./warranty-policies.service";
import type {
  CreateWarrantyPolicyDto,
  ListWarrantyPoliciesQuery,
  UpdateWarrantyPolicyDto,
} from "./dto/warranty-policy.dto";

@Controller("v1/warranty-policies")
@RequireActiveOrg()
export class WarrantyPoliciesController {
  constructor(
    private readonly warrantyPoliciesService: WarrantyPoliciesService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get()
  list(
    @Session() session: UserSession,
    @Query() query: ListWarrantyPoliciesQuery,
  ) {
    return this.warrantyPoliciesService.list(this.orgId(session), {
      search: query.search,
      activeOnly: query.activeOnly === "true" || query.activeOnly === true,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Get(":id")
  getById(@Session() session: UserSession, @Param("id") id: string) {
    return this.warrantyPoliciesService.getById(this.orgId(session), id);
  }

  @Post()
  create(
    @Session() session: UserSession,
    @Body() body: CreateWarrantyPolicyDto,
  ) {
    return this.warrantyPoliciesService.create(this.orgId(session), body);
  }

  @Patch(":id")
  update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: UpdateWarrantyPolicyDto,
  ) {
    return this.warrantyPoliciesService.update(this.orgId(session), id, body);
  }

  @Post("seed-default")
  seedDefault(@Session() session: UserSession) {
    return this.warrantyPoliciesService.seedDefaultPolicy(this.orgId(session));
  }
}
