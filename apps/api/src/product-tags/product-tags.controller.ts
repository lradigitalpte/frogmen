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

  @Post("seed-default")
  seedDefaults(@Session() session: UserSession) {
    return this.productTagsService.seedDefaults(this.orgId(session));
  }

  @Patch(":id")
  update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: CreateProductTagDto,
  ) {
    return this.productTagsService.update(this.orgId(session), id, body.name);
  }

  @Delete(":id")
  archive(@Session() session: UserSession, @Param("id") id: string) {
    return this.productTagsService.archive(this.orgId(session), id);
  }
}
