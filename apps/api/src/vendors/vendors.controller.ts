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
  createVendorSchema,
  listVendorsQuerySchema,
  updateVendorSchema,
  type CreateVendorInput,
  type ListVendorsQuery,
  type UpdateVendorInput,
} from "@frog1/shared";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { VendorsService } from "./vendors.service";

@Controller("v1/vendors")
@RequireActiveOrg()
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

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
    @Query(new ZodValidationPipe(listVendorsQuerySchema)) query: ListVendorsQuery,
  ) {
    return this.vendorsService.list(this.orgId(session), query);
  }

  @Get(":id")
  get(@Session() session: UserSession, @Param("id") id: string) {
    return this.vendorsService.getById(this.orgId(session), id);
  }

  @Post()
  create(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createVendorSchema)) body: CreateVendorInput,
  ) {
    return this.vendorsService.create(this.orgId(session), body);
  }

  @Patch(":id")
  update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateVendorSchema)) body: UpdateVendorInput,
  ) {
    return this.vendorsService.update(this.orgId(session), id, body);
  }

  @Delete(":id")
  archive(@Session() session: UserSession, @Param("id") id: string) {
    return this.vendorsService.archive(this.orgId(session), id);
  }

  @Post(":id/restore")
  restore(@Session() session: UserSession, @Param("id") id: string) {
    return this.vendorsService.restore(this.orgId(session), id);
  }
}
