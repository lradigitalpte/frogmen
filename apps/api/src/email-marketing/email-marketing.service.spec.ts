import { describe, expect, it, vi, beforeEach } from "vitest";
import { EmailMarketingService } from "./email-marketing.service";

describe("EmailMarketingService", () => {
  let service: EmailMarketingService;
  let mockDb: any;
  let mockMailService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };
    mockMailService = {
      sendMail: vi.fn().mockResolvedValue({
        delivered: true,
        mode: "resend",
        id: "re_msg_123",
      }),
    };
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === "APP_URL") return "http://localhost:3000";
        if (key === "API_URL") return "http://localhost:3001";
        if (key === "MAIL_FROM_NAME") return "Frogmen Technologies";
        if (key === "MAIL_FROM_ADDRESS") return "noreply@frogmen.local";
        return undefined;
      }),
    };

    service = new EmailMarketingService(
      mockDb,
      mockMailService,
      mockConfigService,
    );
  });

  describe("testSend", () => {
    it("renders and sends a test email preview with merge data", async () => {
      const result = await service.testSend("org-1", {
        recipientEmail: "test@partner.com",
        subject: "Hello {{company}}",
        bodyHtml: "<p>Welcome {{first_name}}</p>",
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("resend");
      expect(result.resendId).toBe("re_msg_123");
      expect(mockMailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@partner.com",
          subject: "[TEST] Hello Acme Offshore Marine",
        }),
      );
    });
  });

  describe("handleResendWebhook", () => {
    it("updates recipient and recalculates campaign stats on email.delivered event", async () => {
      const mockRecipient = {
        id: "recip-1",
        campaignId: "camp-1",
        resendEmailId: "re_msg_123",
        status: "sent",
      };

      const mockStats = {
        delivered: 1,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
      };

      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return {
                limit: vi.fn().mockResolvedValue([mockRecipient]),
              };
            }
            return Promise.resolve([mockStats]);
          }),
        })),
      }));

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.handleResendWebhook({
        type: "email.delivered",
        data: {
          email_id: "re_msg_123",
          to: ["test@partner.com"],
        },
      });

      expect(result.received).toBe(true);
      expect(result.matched).toBe(true);
      expect(result.event).toBe("email.delivered");
      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});
