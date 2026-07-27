import { Controller, Get, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { asc, eq } from "drizzle-orm";
import { currencies, type Database } from "@frog1/db";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { DATABASE } from "../database/database.constants";

export interface CurrencyRow {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
}

@Controller("health")
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  @Get("currencies")
  @AllowAnonymous()
  listCurrencies(): Promise<CurrencyRow[]> {
    return this.db
      .select({
        id: currencies.id,
        code: currencies.code,
        name: currencies.name,
        symbol: currencies.symbol,
        decimalPlaces: currencies.decimalPlaces,
      })
      .from(currencies)
      .where(eq(currencies.isActive, true))
      .orderBy(asc(currencies.code));
  }

  @Get()
  @AllowAnonymous()
  async getHealth() {
    const currencyRows = await this.db
      .select({ code: currencies.code })
      .from(currencies);

    return {
      status: "ok",
      service: "frog1-api",
      database: "connected",
      currencies: currencyRows.length,
      defaultCurrency: this.config.get<string>("DEFAULT_CURRENCY", "USD"),
    };
  }
}
