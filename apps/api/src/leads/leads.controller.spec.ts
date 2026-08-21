import { describe, expect, it, vi, beforeEach } from "vitest";
import { LeadsController } from "./leads.controller";
import type { LeadsService } from "./leads.service";
import type { UserSession } from "@thallesp/nestjs-better-auth";

describe("LeadsController", () => {
  let controller: LeadsController;
  let mockLeadsService: Partial<LeadsService>;

  const mockSession: UserSession = {
    user: { id: "user-1", email: "sales@frogmen.com", name: "Sarah" } as any,
    session: { id: "sess-1", activeOrganizationId: "org-1" } as any,
  };

  beforeEach(() => {
    mockLeadsService = {
      list: vi.fn().mockResolvedValue({ data: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 1 } }),
      getStats: vi.fn().mockResolvedValue({ totalLeads: 0, totalPipelineValue: 0 }),
      findOne: vi.fn().mockResolvedValue({ id: "lead-1", name: "Test Lead" }),
      create: vi.fn().mockResolvedValue({ id: "lead-1", name: "New Lead" }),
      update: vi.fn().mockResolvedValue({ id: "lead-1", name: "Updated Lead" }),
      updateStage: vi.fn().mockResolvedValue({ id: "lead-1", stage: "qualified" }),
      logContact: vi.fn().mockResolvedValue({ lead: {}, log: {} }),
      convertToCustomer: vi.fn().mockResolvedValue({ lead: {}, customer: {} }),
      remove: vi.fn().mockResolvedValue({ id: "lead-1", deletedAt: new Date() }),
    };

    controller = new LeadsController(mockLeadsService as LeadsService);
  });

  it("lists leads for active organization", async () => {
    const result = await controller.list(mockSession, { page: 1, perPage: 20 } as any);
    expect(mockLeadsService.list).toHaveBeenCalledWith("org-1", { page: 1, perPage: 20 });
    expect(result.data).toEqual([]);
  });

  it("fetches pipeline statistics", async () => {
    const stats = await controller.getStats(mockSession);
    expect(mockLeadsService.getStats).toHaveBeenCalledWith("org-1");
    expect(stats.totalLeads).toBe(0);
  });

  it("creates a new lead", async () => {
    const leadInput = {
      name: "Commander Alex",
      company: "Fleet Logistics",
      leadSource: "website" as const,
      priority: "warm" as const,
      estimatedValue: 15000,
      contacted: false,
    };

    const res = await controller.create(mockSession, leadInput);
    expect(mockLeadsService.create).toHaveBeenCalledWith("org-1", leadInput);
    expect(res).toBeDefined();
  });

  it("updates lead stage", async () => {
    await controller.updateStage(mockSession, "lead-1", { stage: "qualified" });
    expect(mockLeadsService.updateStage).toHaveBeenCalledWith("org-1", "lead-1", "qualified");
  });

  it("converts lead to customer", async () => {
    await controller.convertToCustomer(mockSession, "lead-1");
    expect(mockLeadsService.convertToCustomer).toHaveBeenCalledWith("org-1", "lead-1");
  });
});
