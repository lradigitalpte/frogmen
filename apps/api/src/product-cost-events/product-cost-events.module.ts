import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ProductCostEventsService } from "./product-cost-events.service";

@Module({
  imports: [DatabaseModule],
  providers: [ProductCostEventsService],
  exports: [ProductCostEventsService],
})
export class ProductCostEventsModule {}
