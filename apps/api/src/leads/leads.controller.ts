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
import {
  createLeadSchema,
  listLeadsQuerySchema,
  logContactSchema,
  updateLeadSchema,
  updateLeadStageSchema,
  type CreateLeadInput,
  type ListLeadsQuery,
  type LogContactInput,
  type UpdateLeadInput,
} from "@frog1/shared";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LeadsService } from "./leads.service";

@Controller("v1/leads")
@RequireActiveOrg()
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  private orgId(session: UserSession): string {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      throw new Error("Active organization is required");
    }
    return organizationId;
  }

  @Get()
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(listLeadsQuerySchema)) query: ListLeadsQuery,
  ) {
    return this.leadsService.list(this.orgId(session), query);
  }

  @Get("stats")
  async getStats(@Session() session: UserSession) {
    return this.leadsService.getStats(this.orgId(session));
  }

  @Get(":id")
  async findOne(
    @Session() session: UserSession,
    @Param("id") id: string,
  ) {
    return this.leadsService.findOne(this.orgId(session), id);
  }

  @Post()
  async create(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createLeadSchema)) input: CreateLeadInput,
  ) {
    return this.leadsService.create(this.orgId(session), input);
  }

  @Patch(":id")
  async update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLeadSchema)) input: UpdateLeadInput,
  ) {
    return this.leadsService.update(this.orgId(session), id, input);
  }

  @Patch(":id/stage")
  async updateStage(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLeadStageSchema)) body: { stage: string },
  ) {
    return this.leadsService.updateStage(this.orgId(session), id, body.stage);
  }

  @Post(":id/contact-log")
  async logContact(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(logContactSchema)) input: LogContactInput,
  ) {
    return this.leadsService.logContact(this.orgId(session), id, input);
  }

  @Post(":id/convert")
  async convertToCustomer(
    @Session() session: UserSession,
    @Param("id") id: string,
  ) {
    return this.leadsService.convertToCustomer(this.orgId(session), id);
  }

  @Delete(":id")
  async remove(
    @Session() session: UserSession,
    @Param("id") id: string,
  ) {
    return this.leadsService.remove(this.orgId(session), id);
  }
}
