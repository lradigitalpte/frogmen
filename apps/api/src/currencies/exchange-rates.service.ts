import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, lte } from "drizzle-orm";
import { exchangeRates, organizations, type Database } from "@frog1/db";
import { DATABASE } from "../database/database.constants";

export interface UpsertExchangeRateInput {
  fromCurrencyId: string;
  toCurrencyId: string;
  rate: number;
  effectiveDate?: string;
}

@Injectable()
export class ExchangeRatesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getLatestRate(
    organizationId: string,
    fromCurrencyId: string,
    toCurrencyId: string,
    asOfDate?: string,
  ): Promise<number> {
    if (fromCurrencyId === toCurrencyId) {
      return 1;
    }

    const direct = await this.lookupDirectRate(
      organizationId,
      fromCurrencyId,
      toCurrencyId,
      asOfDate,
    );
    if (direct != null) {
      return direct;
    }

    const inverse = await this.lookupDirectRate(
      organizationId,
      toCurrencyId,
      fromCurrencyId,
      asOfDate,
    );
    if (inverse != null && inverse > 0) {
      return 1 / inverse;
    }

    return 1;
  }

  async getRequiredRate(
    organizationId: string,
    fromCurrencyId: string,
    toCurrencyId: string,
    asOfDate?: string,
  ): Promise<number> {
    if (fromCurrencyId === toCurrencyId) {
      return 1;
    }

    const direct = await this.lookupDirectRate(
      organizationId,
      fromCurrencyId,
      toCurrencyId,
      asOfDate,
    );
    if (direct != null) {
      return direct;
    }

    const inverse = await this.lookupDirectRate(
      organizationId,
      toCurrencyId,
      fromCurrencyId,
      asOfDate,
    );
    if (inverse != null && inverse > 0) {
      return 1 / inverse;
    }

    const viaBase = await this.getRateViaBase(
      organizationId,
      fromCurrencyId,
      toCurrencyId,
      asOfDate,
    );
    if (viaBase != null) {
      return viaBase;
    }

    throw new BadRequestException(
      "No exchange rate is configured for this currency pair. Add a rate under Settings → Currencies before converting amounts.",
    );
  }

  async hasConfiguredRate(
    organizationId: string,
    fromCurrencyId: string,
    toCurrencyId: string,
    asOfDate?: string,
  ): Promise<boolean> {
    if (fromCurrencyId === toCurrencyId) {
      return true;
    }

    if (
      (await this.lookupDirectRate(
        organizationId,
        fromCurrencyId,
        toCurrencyId,
        asOfDate,
      )) != null
    ) {
      return true;
    }

    if (
      (await this.lookupDirectRate(
        organizationId,
        toCurrencyId,
        fromCurrencyId,
        asOfDate,
      )) != null
    ) {
      return true;
    }

    const viaBase = await this.getRateViaBase(
      organizationId,
      fromCurrencyId,
      toCurrencyId,
      asOfDate,
    );
    return viaBase != null;
  }

  async listForOrganization(organizationId: string) {
    return this.db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.organizationId, organizationId))
      .orderBy(desc(exchangeRates.effectiveDate));
  }

  async upsertRate(organizationId: string, input: UpsertExchangeRateInput) {
    const effectiveDate =
      input.effectiveDate ?? new Date().toISOString().slice(0, 10);

    const [existing] = await this.db
      .select({ id: exchangeRates.id })
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrencyId, input.fromCurrencyId),
          eq(exchangeRates.toCurrencyId, input.toCurrencyId),
          eq(exchangeRates.effectiveDate, effectiveDate),
          eq(exchangeRates.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (existing) {
      await this.db
        .update(exchangeRates)
        .set({
          rate: String(input.rate),
          source: "manual",
        })
        .where(eq(exchangeRates.id, existing.id));
    } else {
      await this.db.insert(exchangeRates).values({
        organizationId,
        fromCurrencyId: input.fromCurrencyId,
        toCurrencyId: input.toCurrencyId,
        rate: String(input.rate),
        effectiveDate,
        source: "manual",
      });
    }

    return this.getLatestRate(
      organizationId,
      input.fromCurrencyId,
      input.toCurrencyId,
    );
  }

  private async lookupDirectRate(
    organizationId: string,
    fromCurrencyId: string,
    toCurrencyId: string,
    asOfDate?: string,
  ): Promise<number | null> {
    const filters = [
      eq(exchangeRates.fromCurrencyId, fromCurrencyId),
      eq(exchangeRates.toCurrencyId, toCurrencyId),
      eq(exchangeRates.organizationId, organizationId),
    ];

    if (asOfDate) {
      filters.push(lte(exchangeRates.effectiveDate, asOfDate));
    }

    const [row] = await this.db
      .select({ rate: exchangeRates.rate })
      .from(exchangeRates)
      .where(and(...filters))
      .orderBy(desc(exchangeRates.effectiveDate))
      .limit(1);

    if (!row?.rate) {
      return null;
    }

    return Number(row.rate);
  }

  /** Cross-rate via org base: rate(from→to) = rate(from→base) × rate(base→to). */
  private async getRateViaBase(
    organizationId: string,
    fromCurrencyId: string,
    toCurrencyId: string,
    asOfDate?: string,
  ): Promise<number | null> {
    const [org] = await this.db
      .select({ baseCurrencyId: organizations.baseCurrencyId })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const baseCurrencyId = org?.baseCurrencyId;
    if (!baseCurrencyId || baseCurrencyId === fromCurrencyId || baseCurrencyId === toCurrencyId) {
      return null;
    }

    const fromToBase = await this.lookupDirectRate(
      organizationId,
      fromCurrencyId,
      baseCurrencyId,
      asOfDate,
    );
    const baseToFrom = await this.lookupDirectRate(
      organizationId,
      baseCurrencyId,
      fromCurrencyId,
      asOfDate,
    );
    const fromRate =
      fromToBase ??
      (baseToFrom != null && baseToFrom > 0 ? 1 / baseToFrom : null);

    const baseToTo = await this.lookupDirectRate(
      organizationId,
      baseCurrencyId,
      toCurrencyId,
      asOfDate,
    );
    const toToBase = await this.lookupDirectRate(
      organizationId,
      toCurrencyId,
      baseCurrencyId,
      asOfDate,
    );
    const toRate =
      baseToTo ??
      (toToBase != null && toToBase > 0 ? 1 / toToBase : null);

    if (fromRate == null || toRate == null) {
      return null;
    }

    return fromRate * toRate;
  }
}
