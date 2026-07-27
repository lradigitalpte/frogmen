import {

  Body,

  Controller,

  Delete,

  Get,

  Param,

  Patch,

  Post,

  Query,

  UploadedFile,

  UseInterceptors,

} from "@nestjs/common";

import { FileInterceptor } from "@nestjs/platform-express";

import {

  createCustomerSchema,

  listCustomersQuerySchema,

  updateCustomerSchema,

  type CreateCustomerInput,

  type ListCustomersQuery,

  type UpdateCustomerInput,

} from "@frog1/shared";

import {

  RequireActiveOrg,

  Session,

  type UserSession,

} from "@thallesp/nestjs-better-auth";

import { ZodValidationPipe } from "../common/zod-validation.pipe";

import { CustomersService } from "./customers.service";



@Controller("v1/customers")

@RequireActiveOrg()

export class CustomersController {

  constructor(private readonly customersService: CustomersService) {}



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

    @Query(new ZodValidationPipe(listCustomersQuerySchema)) query: ListCustomersQuery,

  ) {

    return this.customersService.list(this.orgId(session), query);

  }



  @Get("stats")
  stats(@Session() session: UserSession) {
    return this.customersService.getStats(this.orgId(session));
  }

  @Get(":id/activity")
  activity(@Session() session: UserSession, @Param("id") id: string) {
    return this.customersService.getActivity(this.orgId(session), id);
  }

  @Get(":id")

  get(@Session() session: UserSession, @Param("id") id: string) {

    return this.customersService.getById(this.orgId(session), id);

  }



  @Post()

  create(

    @Session() session: UserSession,

    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,

  ) {

    return this.customersService.create(this.orgId(session), body);

  }



  @Patch(":id")

  update(

    @Session() session: UserSession,

    @Param("id") id: string,

    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,

  ) {

    return this.customersService.update(this.orgId(session), id, body);

  }



  @Post(":id/avatar")

  @UseInterceptors(

    FileInterceptor("file", {

      limits: { fileSize: 5 * 1024 * 1024 },

    }),

  )

  uploadAvatar(

    @Session() session: UserSession,

    @Param("id") id: string,

    @UploadedFile() file: Express.Multer.File,

  ) {

    return this.customersService.setAvatar(this.orgId(session), id, file);

  }



  @Delete(":id")

  archive(@Session() session: UserSession, @Param("id") id: string) {

    return this.customersService.archive(this.orgId(session), id);

  }



  @Post(":id/restore")

  restore(@Session() session: UserSession, @Param("id") id: string) {

    return this.customersService.restore(this.orgId(session), id);

  }

}


