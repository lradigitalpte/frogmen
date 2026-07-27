import { Module } from "@nestjs/common";
import { ProductTagsController } from "./product-tags.controller";
import { ProductTagsService } from "./product-tags.service";

@Module({
  controllers: [ProductTagsController],
  providers: [ProductTagsService],
  exports: [ProductTagsService],
})
export class ProductTagsModule {}
