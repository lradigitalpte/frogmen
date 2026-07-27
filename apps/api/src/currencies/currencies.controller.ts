import { BadRequestException, Body, Controller, Get, Inject, Put, Query } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { currencies, type Database } from "@frog1/db";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { DATABASE } from "../database/database.constants";
import type { CurrencyRow } from "../health/health.controller";
import { ExchangeRatesService } from "./exchange-rates.service";

@Controller("v1/currencies")
@RequireActiveOrg()
export class CurrenciesController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get()
  list(): Promise<CurrencyRow[]> {
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

  @Get("exchange-rates")
  async listExchangeRates(@Session() session: UserSession) {
    const organizationId = this.orgId(session);
    const [rates, currencyRows] = await Promise.all([
      this.exchangeRatesService.listForOrganization(organizationId),
      this.db
        .select({
          id: currencies.id,
          code: currencies.code,
        })
        .from(currencies),
    ]);

    const codeById = new Map(
      currencyRows.map((currency) => [currency.id, currency.code.trim()]),
    );

    return rates.map((rate) => ({
      id: rate.id,
      fromCurrencyId: rate.fromCurrencyId,
      toCurrencyId: rate.toCurrencyId,
      fromCurrencyCode: codeById.get(rate.fromCurrencyId) ?? null,
      toCurrencyCode: codeById.get(rate.toCurrencyId) ?? null,
      rate: Number(rate.rate),
      effectiveDate: rate.effectiveDate,
      source: rate.source,
    }));
  }

  @Get("exchange-rates/latest")
  async getLatestExchangeRate(
    @Session() session: UserSession,
    @Query("fromCurrencyId") fromCurrencyId: string,
    @Query("toCurrencyId") toCurrencyId: string,
    @Query("asOfDate") asOfDate?: string,
  ) {
    const organizationId = this.orgId(session);
    const rate = await this.exchangeRatesService.getLatestRate(
      organizationId,
      fromCurrencyId,
      toCurrencyId,
      asOfDate,
    );
    const configured = await this.exchangeRatesService.hasConfiguredRate(
      organizationId,
      fromCurrencyId,
      toCurrencyId,
      asOfDate,
    );

    return { rate, configured };
  }

  @Put("exchange-rates")
  upsertExchangeRate(
    @Session() session: UserSession,
    @Body()
    body: {
      fromCurrencyId: string;
      toCurrencyId: string;
      rate: number | string;
      effectiveDate?: string;
    },
  ) {
    const rate = Number(body.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new BadRequestException("Exchange rate must be a positive number");
    }

    return this.exchangeRatesService
      .upsertRate(this.orgId(session), {
        fromCurrencyId: body.fromCurrencyId,
        toCurrencyId: body.toCurrencyId,
        rate,
        effectiveDate: body.effectiveDate,
      })
      .then((savedRate) => ({ rate: savedRate }));
  }
}
