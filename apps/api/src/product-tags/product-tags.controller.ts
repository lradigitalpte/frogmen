import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ProductTagsService } from "./product-tags.service";
import type {
  CreateProductTagDto,
  ListProductTagsQuery,
} from "./dto/product-tag.dto";

@Controller("v1/product-tags")
@RequireActiveOrg()
export class ProductTagsController {
  constructor(private readonly productTagsService: ProductTagsService) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get()
  list(@Session() session: UserSession, @Query() query: ListProductTagsQuery) {
    return this.productTagsService.list(this.orgId(session), {
      search: query.search,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Post()
  create(@Session() session: UserSession, @Body() body: CreateProductTagDto) {
    return this.productTagsService.create(this.orgId(session), body);
  }

  @Delete(":id")
  archive(@Session() session: UserSession, @Param("id") id: string) {
    return this.productTagsService.archive(this.orgId(session), id);
  }
}
