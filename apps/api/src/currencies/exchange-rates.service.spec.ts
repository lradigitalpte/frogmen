import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExchangeRatesService } from "./exchange-rates.service";

describe("ExchangeRatesService", () => {
  let service: ExchangeRatesService;

  beforeEach(() => {
    service = new ExchangeRatesService({} as never);
  });

  it("getRequiredRate returns 1 for same currency", async () => {
    await expect(service.getRequiredRate("org-1", "usd", "usd")).resolves.toBe(1);
  });

  it("getRequiredRate throws when no rate is configured", async () => {
    vi.spyOn(
      service as unknown as {
        lookupDirectRate: (...args: unknown[]) => Promise<number | null>;
      },
      "lookupDirectRate",
    ).mockResolvedValue(null);
    vi.spyOn(
      service as unknown as {
        getRateViaBase: (...args: unknown[]) => Promise<number | null>;
      },
      "getRateViaBase",
    ).mockResolvedValue(null);

    await expect(
      service.getRequiredRate("org-1", "usd-id", "aed-id"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("getRequiredRate returns direct rate when configured", async () => {
    vi.spyOn(
      service as unknown as {
        lookupDirectRate: (...args: unknown[]) => Promise<number | null>;
      },
      "lookupDirectRate",
    ).mockResolvedValueOnce(3.67);

    await expect(
      service.getRequiredRate("org-1", "usd-id", "aed-id"),
    ).resolves.toBe(3.67);
  });

  it("getRequiredRate inverts inverse pair", async () => {
    vi.spyOn(
      service as unknown as {
        lookupDirectRate: (...args: unknown[]) => Promise<number | null>;
      },
      "lookupDirectRate",
    )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(4);

    await expect(
      service.getRequiredRate("org-1", "usd-id", "aed-id"),
    ).resolves.toBe(0.25);
  });

  it("hasConfiguredRate returns true for same currency", async () => {
    await expect(
      service.hasConfiguredRate("org-1", "usd-id", "usd-id"),
    ).resolves.toBe(true);
  });
});
