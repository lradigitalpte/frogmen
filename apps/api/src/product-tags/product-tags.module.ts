import { Module } from "@nestjs/common";
import { OrgInventoryModule } from "../inventory/org-inventory.module";
import { ProductTagsController } from "./product-tags.controller";
import { ProductTagsService } from "./product-tags.service";

@Module({
  imports: [OrgInventoryModule],
  controllers: [ProductTagsController],
  providers: [ProductTagsService],
  exports: [ProductTagsService],
})
export class ProductTagsModule {}
