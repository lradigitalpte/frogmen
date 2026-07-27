import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CurrenciesController } from "./currencies.controller";
import { ExchangeRatesService } from "./exchange-rates.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CurrenciesController],
  providers: [ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class CurrenciesModule {}
