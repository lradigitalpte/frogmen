import { Module } from "@nestjs/common";
import { ProductsModule } from "../products/products.module";
import { WarehousesModule } from "../warehouses/warehouses.module";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";

@Module({
  imports: [ProductsModule, WarehousesModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
