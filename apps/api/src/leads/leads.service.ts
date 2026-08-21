import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
  sum,
  type SQL,
} from "drizzle-orm";
import {
  customers,
  leadCommunicationLogs,
  leads,
  type Database,
} from "@frog1/db";
import type {
  CreateLeadInput,
  ListLeadsQuery,
  LogContactInput,
  UpdateLeadInput,
} from "@frog1/shared";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class LeadsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(organizationId: string, query: ListLeadsQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 20, 1), 100);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(leads.organizationId, organizationId),
      isNull(leads.deletedAt),
    ];

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(leads.name, term),
          ilike(leads.company, term),
          ilike(leads.email, term),
          ilike(leads.jobTitle, term),
          ilike(leads.sourceDetails, term),
        )!,
      );
    }

    if (query.leadSource) {
      filters.push(eq(leads.leadSource, query.leadSource));
    }

    if (query.contacted && query.contacted !== "all") {
      filters.push(eq(leads.contacted, query.contacted === "true"));
    }

    if (query.stage) {
      filters.push(eq(leads.stage, query.stage));
    }

    if (query.priority) {
      filters.push(eq(leads.priority, query.priority));
    }

    const whereClause = and(...filters);

    let orderBy: SQL = desc(leads.createdAt);
    if (query.sortBy === "name") {
      orderBy = query.sortOrder === "asc" ? asc(leads.name) : desc(leads.name);
    } else if (query.sortBy === "company") {
      orderBy = query.sortOrder === "asc" ? asc(leads.company) : desc(leads.company);
    } else if (query.sortBy === "estimatedValue") {
      orderBy = query.sortOrder === "asc" ? asc(leads.estimatedValue) : desc(leads.estimatedValue);
    } else if (query.sortBy === "score") {
      orderBy = query.sortOrder === "asc" ? asc(leads.score) : desc(leads.score);
    } else if (query.sortBy === "nextFollowUp") {
      orderBy = query.sortOrder === "asc" ? asc(leads.nextFollowUp) : desc(leads.nextFollowUp);
    }

    const [items, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(leads)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(leads)
        .where(whereClause),
    ]);

    return {
      data: items,
      meta: {
        page,
        perPage,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / perPage) || 1,
      },
    };
  }

  async getStats(organizationId: string) {
    const allLeads = await this.db
      .select()
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)));

    const totalLeads = allLeads.length;
    const contactedLeads = allLeads.filter((l) => l.contacted).length;
    const qualifiedLeads = allLeads.filter((l) => l.stage === "qualified" || l.stage === "proposal").length;
    const wonLeads = allLeads.filter((l) => l.stage === "won").length;

    const totalPipelineValue = allLeads.reduce(
      (sum, l) => sum + (parseFloat(l.estimatedValue?.toString() || "0") || 0),
      0,
    );

    const nowIso = new Date().toISOString();
    const followUpsDueToday = allLeads.filter(
      (l) => l.nextFollowUp && l.nextFollowUp.toISOString() <= nowIso && l.stage !== "won" && l.stage !== "lost",
    ).length;

    const sourceBreakdownMap: Record<string, { count: number; totalValue: number }> = {};
    for (const lead of allLeads) {
      const src = lead.leadSource;
      if (!sourceBreakdownMap[src]) {
        sourceBreakdownMap[src] = { count: 0, totalValue: 0 };
      }
      sourceBreakdownMap[src].count += 1;
      sourceBreakdownMap[src].totalValue += parseFloat(lead.estimatedValue?.toString() || "0") || 0;
    }

    const sourceBreakdown = Object.entries(sourceBreakdownMap).map(([source, data]) => ({
      source,
      count: data.count,
      totalValue: data.totalValue,
      percentage: totalLeads > 0 ? Math.round((data.count / totalLeads) * 100) : 0,
    }));

    return {
      totalLeads,
      contactedLeads,
      contactRatePercent: totalLeads > 0 ? Math.round((contactedLeads / totalLeads) * 100) : 0,
      qualifiedLeads,
      wonLeads,
      winRatePercent: totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0,
      totalPipelineValue,
      followUpsDueToday,
      sourceBreakdown,
    };
  }

  async findOne(organizationId: string, id: string) {
    const [lead] = await this.db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.id, id),
          eq(leads.organizationId, organizationId),
          isNull(leads.deletedAt),
        ),
      );

    if (!lead) {
      throw new NotFoundException("Lead record not found");
    }

    const logs = await this.db
      .select()
      .from(leadCommunicationLogs)
      .where(
        and(
          eq(leadCommunicationLogs.leadId, id),
          eq(leadCommunicationLogs.organizationId, organizationId),
        ),
      )
      .orderBy(desc(leadCommunicationLogs.date));

    return {
      ...lead,
      communicationLogs: logs,
    };
  }

  async create(organizationId: string, input: CreateLeadInput) {
    const [newLead] = await this.db
      .insert(leads)
      .values({
        organizationId,
        name: input.name,
        company: input.company,
        email: input.email,
        phone: input.phone,
        jobTitle: input.jobTitle,
        leadSource: input.leadSource,
        sourceDetails: input.sourceDetails,
        priority: input.priority,
        estimatedValue: input.estimatedValue.toString(),
        assignedToName: input.assignedToName,
        notes: input.notes,
        contacted: input.contacted,
        contactStatus: input.contacted ? "contacted" : "not_contacted",
        score: input.priority === "hot" ? 85 : input.priority === "warm" ? 60 : 40,
      })
      .returning();

    return newLead;
  }

  async update(organizationId: string, id: string, input: UpdateLeadInput) {
    await this.findOne(organizationId, id);

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.company !== undefined) updateData.company = input.company;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.jobTitle !== undefined) updateData.jobTitle = input.jobTitle;
    if (input.leadSource !== undefined) updateData.leadSource = input.leadSource;
    if (input.sourceDetails !== undefined) updateData.sourceDetails = input.sourceDetails;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.estimatedValue !== undefined) updateData.estimatedValue = input.estimatedValue.toString();
    if (input.assignedToName !== undefined) updateData.assignedToName = input.assignedToName;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (input.contacted !== undefined) updateData.contacted = input.contacted;
    if (input.contactStatus !== undefined) updateData.contactStatus = input.contactStatus;
    if (input.stage !== undefined) updateData.stage = input.stage;
    if (input.score !== undefined) updateData.score = input.score;

    const [updatedLead] = await this.db
      .update(leads)
      .set(updateData)
      .where(and(eq(leads.id, id), eq(leads.organizationId, organizationId)))
      .returning();

    return updatedLead;
  }

  async updateStage(organizationId: string, id: string, stage: string) {
    await this.findOne(organizationId, id);

    const [updatedLead] = await this.db
      .update(leads)
      .set({
        stage: stage as any,
        updatedAt: new Date(),
      })
      .where(and(eq(leads.id, id), eq(leads.organizationId, organizationId)))
      .returning();

    return updatedLead;
  }

  async logContact(organizationId: string, id: string, input: LogContactInput) {
    const lead = await this.findOne(organizationId, id);

    const [log] = await this.db
      .insert(leadCommunicationLogs)
      .values({
        leadId: id,
        organizationId,
        type: input.type,
        author: input.authorName,
        summary: input.summary,
        outcome: input.outcome,
        date: new Date(),
      })
      .returning();

    const updateData: Record<string, any> = {
      contacted: true,
      contactStatus: input.type === "meeting" ? "meeting_scheduled" : "contacted",
      lastContactedAt: new Date(),
      lastContactMethod: input.type,
      updatedAt: new Date(),
    };

    if (lead.stage === "new") {
      updateData.stage = "contacted";
    }

    if (input.nextFollowUp) {
      updateData.nextFollowUp = new Date(input.nextFollowUp);
    }

    const [updatedLead] = await this.db
      .update(leads)
      .set(updateData)
      .where(and(eq(leads.id, id), eq(leads.organizationId, organizationId)))
      .returning();

    return {
      lead: updatedLead,
      log,
    };
  }

  async convertToCustomer(organizationId: string, id: string) {
    const lead = await this.findOne(organizationId, id);

    const [newCustomer] = await this.db
      .insert(customers)
      .values({
        organizationId,
        accountType: "company",
        name: lead.company,
        email: lead.email,
        phone: lead.phone,
        jobTitle: lead.jobTitle,
        reference: `LEAD-${lead.id.substring(0, 8)}`,
      })
      .returning();

    const [updatedLead] = await this.db
      .update(leads)
      .set({
        stage: "won",
        updatedAt: new Date(),
      })
      .where(and(eq(leads.id, id), eq(leads.organizationId, organizationId)))
      .returning();

    return {
      lead: updatedLead,
      customer: newCustomer,
    };
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    const [deletedLead] = await this.db
      .update(leads)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(leads.id, id), eq(leads.organizationId, organizationId)))
      .returning();

    return deletedLead;
  }
}
