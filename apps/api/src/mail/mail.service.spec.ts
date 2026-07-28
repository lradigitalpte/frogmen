import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { MailService } from "./mail.service";

describe("MailService", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("logs emails in development when no provider is configured", async () => {
    const service = new MailService({
      get: () => undefined,
    } as unknown as ConfigService);

    const result = await service.sendMail({
      to: "test@example.com",
      subject: "Hello",
      text: "Body",
    });

    expect(result).toEqual({ delivered: false, mode: "log" });
  });

  it("sends branded mail through resend", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-123" }),
    }) as typeof fetch;

    const service = new MailService({
      get: (key: string) => {
        if (key === "RESEND_API_KEY") return "re_test";
        if (key === "MAIL_FROM_ADDRESS") return "hello@send.frogmentec.ae";
        if (key === "MAIL_FROM_NAME") return "Frogmen";
        return undefined;
      },
    } as unknown as ConfigService);

    const result = await service.sendBrandedMail({
      to: "customer@example.com",
      subject: "Quotation Q-1",
      title: "Quotation Q-1",
      bodyText: "Please find attached quotation Q-1.",
    });

    expect(result.delivered).toBe(true);
    expect(result.mode).toBe("resend");
    expect(result.id).toBe("email-123");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
