import { describe, expect, it, vi, beforeEach } from "vitest";
import { LeadsService } from "./leads.service";
import { NotFoundException } from "@nestjs/common";

describe("LeadsService", () => {
  let service: LeadsService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };
    service = new LeadsService(mockDb);
  });

  describe("create", () => {
    it("inserts a new lead with default score and returns it", async () => {
      const createdRecord = {
        id: "lead-1",
        organizationId: "org-1",
        name: "Alex Vance",
        company: "AeroMarine",
        leadSource: "website",
        priority: "hot",
        estimatedValue: "50000",
        score: 85,
        stage: "new",
        contacted: false,
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([createdRecord]),
        }),
      });

      const result = await service.create("org-1", {
        name: "Alex Vance",
        company: "AeroMarine",
        leadSource: "website",
        priority: "hot",
        estimatedValue: 50000,
        contacted: false,
      });

      expect(result).toEqual(createdRecord);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe("getStats", () => {
    it("calculates pipeline metrics, win rate, and source breakdowns", async () => {
      const sampleLeads = [
        {
          id: "1",
          organizationId: "org-1",
          estimatedValue: "10000",
          contacted: true,
          stage: "qualified",
          leadSource: "website",
          nextFollowUp: new Date(Date.now() - 3600 * 1000),
        },
        {
          id: "2",
          organizationId: "org-1",
          estimatedValue: "20000",
          contacted: false,
          stage: "new",
          leadSource: "google_ads",
          nextFollowUp: null,
        },
        {
          id: "3",
          organizationId: "org-1",
          estimatedValue: "30000",
          contacted: true,
          stage: "won",
          leadSource: "website",
          nextFollowUp: null,
        },
      ];

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(sampleLeads),
        }),
      });

      const stats = await service.getStats("org-1");

      expect(stats.totalLeads).toBe(3);
      expect(stats.contactedLeads).toBe(2);
      expect(stats.contactRatePercent).toBe(67);
      expect(stats.wonLeads).toBe(1);
      expect(stats.winRatePercent).toBe(33);
      expect(stats.totalPipelineValue).toBe(60000);
      expect(stats.sourceBreakdown.length).toBeGreaterThan(0);
    });
  });

  describe("updateStage", () => {
    it("updates lead stage and returns updated record", async () => {
      const mockLead = { id: "lead-1", organizationId: "org-1", stage: "new" };

      // findOne mock (leads query + logs query)
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            const res = [mockLead];
            (res as any).orderBy = vi.fn().mockResolvedValue([]);
            return res;
          }),
        }),
      }));

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...mockLead, stage: "proposal" }]),
          }),
        }),
      });

      const result = await service.updateStage("org-1", "lead-1", "proposal");
      expect(result.stage).toBe("proposal");
    });
  });

  describe("remove", () => {
    it("throws NotFoundException if lead does not exist", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.remove("org-1", "non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
