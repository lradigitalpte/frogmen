import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import {
  customers,
  emailCampaignRecipients,
  emailCampaigns,
  emailMarketingUnsubscribes,
  emailTemplates,
  leads,
  type Database,
  type EmailCampaignRecipientRecord,
  type EmailCampaignRecord,
  type EmailTemplateRecord,
} from "@frog1/db";
import {
  renderMarketingEmailHtml,
  SYSTEM_PRESET_TEMPLATES,
  type CreateEmailCampaignInput,
  type CreateEmailTemplateInput,
  type EmailDesignConfig,
  type ListEmailCampaignsQuery,
  type TargetAudienceFilter,
  type TestSendCampaignInput,
  type UpdateEmailCampaignInput,
  type UpdateEmailTemplateInput,
} from "@frog1/shared";
import { DATABASE } from "../database/database.constants";
import { MailService } from "../mail/mail.service";

export interface ResolvedRecipient {
  recipientType: "contact" | "lead" | "custom";
  contactId?: string;
  leadId?: string;
  email: string;
  name: string;
  company: string;
  jobTitle?: string;
}

@Injectable()
export class EmailMarketingService {
  private readonly logger = new Logger(EmailMarketingService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  private getAppBaseUrl(): string {
    return (
      this.config.get<string>("APP_URL") ||
      this.config.get<string>("NEXT_PUBLIC_APP_URL") ||
      "http://localhost:3000"
    );
  }

  private getApiBaseUrl(): string {
    return (
      this.config.get<string>("API_URL") ||
      this.config.get<string>("NEXT_PUBLIC_API_URL") ||
      "http://localhost:3001"
    );
  }

  // ==========================================
  // TEMPLATES
  // ==========================================

  async listTemplates(organizationId: string, search?: string) {
    const filters: SQL[] = [
      eq(emailTemplates.organizationId, organizationId),
      isNull(emailTemplates.deletedAt),
    ];

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      filters.push(
        or(
          ilike(emailTemplates.name, term),
          ilike(emailTemplates.subject, term),
          ilike(emailTemplates.description, term),
        )!,
      );
    }

    return this.db
      .select()
      .from(emailTemplates)
      .where(and(...filters))
      .orderBy(desc(emailTemplates.isSystemPreset), desc(emailTemplates.createdAt));
  }

  async getTemplate(organizationId: string, id: string) {
    const [template] = await this.db
      .select()
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.id, id),
          eq(emailTemplates.organizationId, organizationId),
          isNull(emailTemplates.deletedAt),
        ),
      )
      .limit(1);

    if (!template) {
      throw new NotFoundException("Email template not found");
    }

    return template;
  }

  async createTemplate(organizationId: string, input: CreateEmailTemplateInput) {
    const [created] = await this.db
      .insert(emailTemplates)
      .values({
        organizationId,
        name: input.name,
        description: input.description,
        category: input.category,
        subject: input.subject,
        previewText: input.previewText,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText,
        designConfig: input.designConfig,
        isSystemPreset: input.isSystemPreset ?? false,
      })
      .returning();

    return created;
  }

  async updateTemplate(
    organizationId: string,
    id: string,
    input: UpdateEmailTemplateInput,
  ) {
    await this.getTemplate(organizationId, id);

    const [updated] = await this.db
      .update(emailTemplates)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailTemplates.id, id),
          eq(emailTemplates.organizationId, organizationId),
        ),
      )
      .returning();

    return updated;
  }

  async deleteTemplate(organizationId: string, id: string) {
    await this.getTemplate(organizationId, id);

    await this.db
      .update(emailTemplates)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailTemplates.id, id),
          eq(emailTemplates.organizationId, organizationId),
        ),
      );

    return { success: true };
  }

  // ==========================================
  // AUDIENCE RESOLUTION
  // ==========================================

  async resolveAudience(
    organizationId: string,
    filter?: Partial<TargetAudienceFilter>,
  ): Promise<ResolvedRecipient[]> {
    const audienceType = filter?.audienceType || "all";
    const recipientsMap = new Map<string, ResolvedRecipient>();

    // 1. Get unsubscribed emails for this organization
    const unsubscribedRecords = await this.db
      .select({ email: emailMarketingUnsubscribes.email })
      .from(emailMarketingUnsubscribes)
      .where(eq(emailMarketingUnsubscribes.organizationId, organizationId));

    const unsubscribedSet = new Set(
      unsubscribedRecords.map((r) => r.email.toLowerCase().trim()),
    );

    // 2. Fetch Contacts (Customers) if audienceType is 'all' or 'contacts' or 'segment'
    if (audienceType === "all" || audienceType === "contacts" || audienceType === "segment") {
      const contactConditions: SQL[] = [
        eq(customers.organizationId, organizationId),
        isNull(customers.deletedAt),
        isNotNull(customers.email),
      ];

      if (filter?.contactIsActiveOnly !== false) {
        contactConditions.push(eq(customers.isActive, true));
      }

      if (filter?.contactAccountTypes?.length) {
        contactConditions.push(
          inArray(customers.accountType, filter.contactAccountTypes),
        );
      }

      if (filter?.selectedCustomerIds?.length) {
        contactConditions.push(
          inArray(customers.id, filter.selectedCustomerIds),
        );
      }

      const contactsList = await this.db
        .select({
          id: customers.id,
          name: customers.name,
          email: customers.email,
          jobTitle: customers.jobTitle,
          accountType: customers.accountType,
        })
        .from(customers)
        .where(and(...contactConditions));

      for (const contact of contactsList) {
        if (!contact.email) continue;
        const normalizedEmail = contact.email.toLowerCase().trim();
        if (filter?.excludeUnsubscribed !== false && unsubscribedSet.has(normalizedEmail)) {
          continue;
        }

        if (!recipientsMap.has(normalizedEmail)) {
          recipientsMap.set(normalizedEmail, {
            recipientType: "contact",
            contactId: contact.id,
            email: contact.email.trim(),
            name: contact.name,
            company: contact.accountType === "company" ? contact.name : "",
            jobTitle: contact.jobTitle || undefined,
          });
        }
      }
    }

    // 3. Fetch Leads if audienceType is 'all' or 'leads' or 'segment'
    if (audienceType === "all" || audienceType === "leads" || audienceType === "segment") {
      const leadConditions: SQL[] = [
        eq(leads.organizationId, organizationId),
        isNull(leads.deletedAt),
        isNotNull(leads.email),
      ];

      if (filter?.leadStages?.length) {
        leadConditions.push(inArray(leads.stage, filter.leadStages as any));
      }

      if (filter?.leadPriorities?.length) {
        leadConditions.push(inArray(leads.priority, filter.leadPriorities as any));
      }

      if (filter?.leadSources?.length) {
        leadConditions.push(inArray(leads.leadSource, filter.leadSources as any));
      }

      if (filter?.leadContactStatuses?.length) {
        leadConditions.push(
          inArray(leads.contactStatus, filter.leadContactStatuses as any),
        );
      }

      if (filter?.selectedLeadIds?.length) {
        leadConditions.push(inArray(leads.id, filter.selectedLeadIds));
      }

      const leadsList = await this.db
        .select({
          id: leads.id,
          name: leads.name,
          company: leads.company,
          email: leads.email,
          jobTitle: leads.jobTitle,
        })
        .from(leads)
        .where(and(...leadConditions));

      for (const lead of leadsList) {
        if (!lead.email) continue;
        const normalizedEmail = lead.email.toLowerCase().trim();
        if (filter?.excludeUnsubscribed !== false && unsubscribedSet.has(normalizedEmail)) {
          continue;
        }

        if (!recipientsMap.has(normalizedEmail)) {
          recipientsMap.set(normalizedEmail, {
            recipientType: "lead",
            leadId: lead.id,
            email: lead.email.trim(),
            name: lead.name,
            company: lead.company || "",
            jobTitle: lead.jobTitle || undefined,
          });
        }
      }
    }

    // 4. Custom Emails
    if (filter?.customEmails?.length) {
      for (const item of filter.customEmails) {
        const normalizedEmail = item.email.toLowerCase().trim();
        if (filter?.excludeUnsubscribed !== false && unsubscribedSet.has(normalizedEmail)) {
          continue;
        }

        recipientsMap.set(normalizedEmail, {
          recipientType: "custom",
          email: item.email.trim(),
          name: item.name || item.email.split("@")[0] || "Partner",
          company: item.company || "",
        });
      }
    }

    let allRecipients = Array.from(recipientsMap.values());

    // 5. Excluded Emails (deselected by user)
    if (filter?.excludedEmails?.length) {
      const excludedSet = new Set(
        filter.excludedEmails.map((e) => e.toLowerCase().trim()),
      );
      allRecipients = allRecipients.filter(
        (r) => !excludedSet.has(r.email.toLowerCase().trim()),
      );
    }

    // 6. Selected Emails (explicit selection)
    if (filter?.selectedEmails?.length) {
      const selectedSet = new Set(
        filter.selectedEmails.map((e) => e.toLowerCase().trim()),
      );
      allRecipients = allRecipients.filter((r) =>
        selectedSet.has(r.email.toLowerCase().trim()),
      );
    }

    return allRecipients;
  }

  async getAudiencePreview(organizationId: string, filter?: Partial<TargetAudienceFilter>) {
    // When requesting preview, get the base list without excludedEmails so the UI can show checkboxes for all available candidates
    const baseFilter = { ...filter };
    delete baseFilter.excludedEmails;
    const allCandidates = await this.resolveAudience(organizationId, baseFilter);

    // Also calculate active count with excludedEmails applied
    const activeRecipients = await this.resolveAudience(organizationId, filter);

    let contactCount = 0;
    let leadCount = 0;
    let customCount = 0;

    for (const r of allCandidates) {
      if (r.recipientType === "contact") contactCount++;
      else if (r.recipientType === "lead") leadCount++;
      else customCount++;
    }

    return {
      totalCount: allCandidates.length,
      activeCount: activeRecipients.length,
      contactCount,
      leadCount,
      customCount,
      sampleRecipients: allCandidates.slice(0, 500),
    };
  }

  // ==========================================
  // CAMPAIGNS CRUD
  // ==========================================

  async listCampaigns(organizationId: string, query: ListEmailCampaignsQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 20, 1), 100);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(emailCampaigns.organizationId, organizationId),
      isNull(emailCampaigns.deletedAt),
    ];

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(emailCampaigns.name, term),
          ilike(emailCampaigns.subject, term),
          ilike(emailCampaigns.fromName, term),
        )!,
      );
    }

    if (query.status) {
      filters.push(eq(emailCampaigns.status, query.status));
    }

    if (query.audienceType) {
      filters.push(eq(emailCampaigns.targetAudienceType, query.audienceType));
    }

    const [countResult] = await this.db
      .select({ total: count() })
      .from(emailCampaigns)
      .where(and(...filters));

    const items = await this.db
      .select()
      .from(emailCampaigns)
      .where(and(...filters))
      .orderBy(desc(emailCampaigns.createdAt))
      .limit(perPage)
      .offset(offset);

    // Calculate aggregated overall KPIs
    const [statsResult] = await this.db
      .select({
        totalSent: sql<number>`coalesce(sum(${emailCampaigns.sentCount}), 0)`,
        totalDelivered: sql<number>`coalesce(sum(${emailCampaigns.deliveredCount}), 0)`,
        totalOpened: sql<number>`coalesce(sum(${emailCampaigns.openedCount}), 0)`,
        totalClicked: sql<number>`coalesce(sum(${emailCampaigns.clickedCount}), 0)`,
        totalBounced: sql<number>`coalesce(sum(${emailCampaigns.bouncedCount}), 0)`,
      })
      .from(emailCampaigns)
      .where(
        and(
          eq(emailCampaigns.organizationId, organizationId),
          isNull(emailCampaigns.deletedAt),
        ),
      );

    return {
      items,
      total: countResult?.total ?? 0,
      page,
      perPage,
      totalPages: Math.ceil((countResult?.total ?? 0) / perPage),
      overviewStats: {
        totalCampaigns: countResult?.total ?? 0,
        totalSent: Number(statsResult?.totalSent || 0),
        totalDelivered: Number(statsResult?.totalDelivered || 0),
        totalOpened: Number(statsResult?.totalOpened || 0),
        totalClicked: Number(statsResult?.totalClicked || 0),
        totalBounced: Number(statsResult?.totalBounced || 0),
      },
    };
  }

  async getCampaign(organizationId: string, id: string) {
    const [campaign] = await this.db
      .select()
      .from(emailCampaigns)
      .where(
        and(
          eq(emailCampaigns.id, id),
          eq(emailCampaigns.organizationId, organizationId),
          isNull(emailCampaigns.deletedAt),
        ),
      )
      .limit(1);

    if (!campaign) {
      throw new NotFoundException("Campaign not found");
    }

    return campaign;
  }

  async createCampaign(
    organizationId: string,
    input: CreateEmailCampaignInput,
    userId?: string,
  ) {
    const defaultFromName =
      input.fromName ||
      this.config.get<string>("MAIL_FROM_NAME") ||
      "Frogmen Technologies";
    const defaultFromEmail =
      input.fromEmail ||
      this.config.get<string>("MAIL_FROM_ADDRESS") ||
      "noreply@frogmen.local";

    const [created] = await this.db
      .insert(emailCampaigns)
      .values({
        organizationId,
        name: input.name,
        subject: input.subject,
        previewText: input.previewText,
        fromName: defaultFromName,
        fromEmail: defaultFromEmail,
        replyTo: input.replyTo,
        templateId: input.templateId,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText,
        designConfig: input.designConfig,
        targetAudienceType: input.targetAudienceType,
        audienceFilter: input.audienceFilter,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        status: input.scheduledAt ? "scheduled" : "draft",
        createdByUserId: userId,
      })
      .returning();

    return created;
  }

  async updateCampaign(
    organizationId: string,
    id: string,
    input: UpdateEmailCampaignInput,
  ) {
    const existing = await this.getCampaign(organizationId, id);

    if (existing.status === "sending" || existing.status === "sent") {
      throw new BadRequestException(
        "Cannot modify a campaign that is already sending or sent",
      );
    }

    const [updated] = await this.db
      .update(emailCampaigns)
      .set({
        ...input,
        scheduledAt: input.scheduledAt !== undefined
          ? (input.scheduledAt ? new Date(input.scheduledAt) : null)
          : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailCampaigns.id, id),
          eq(emailCampaigns.organizationId, organizationId),
        ),
      )
      .returning();

    return updated;
  }

  async deleteCampaign(organizationId: string, id: string) {
    await this.getCampaign(organizationId, id);

    await this.db
      .update(emailCampaigns)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailCampaigns.id, id),
          eq(emailCampaigns.organizationId, organizationId),
        ),
      );

    return { success: true };
  }

  // ==========================================
  // DISPATCH & TEST SENDING
  // ==========================================

  async testSend(organizationId: string, input: TestSendCampaignInput) {
    const apiBaseUrl = this.getApiBaseUrl();
    const appBaseUrl = this.getAppBaseUrl();

    const mergeData = {
      name: input.sampleData?.name || "Alex Morgan",
      firstName: input.sampleData?.firstName || "Alex",
      company: input.sampleData?.company || "Acme Offshore Marine",
      jobTitle: input.sampleData?.jobTitle || "Technical Director",
      email: input.recipientEmail,
      unsubscribeUrl: `${appBaseUrl}/marketing/unsubscribe?preview=true`,
    };

    const rendered = renderMarketingEmailHtml({
      subject: input.subject,
      previewText: input.previewText,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      design: input.designConfig,
      mergeData,
    });

    const result = await this.mailService.sendMail({
      to: input.recipientEmail,
      subject: `[TEST] ${rendered.text.split("\n")[0] || input.subject}`,
      text: rendered.text,
      html: rendered.html,
    });

    return {
      success: true,
      mode: result.mode,
      resendId: result.id,
      recipient: input.recipientEmail,
    };
  }

  async sendCampaign(organizationId: string, campaignId: string) {
    const campaign = await this.getCampaign(organizationId, campaignId);

    if (campaign.status === "sending" || campaign.status === "sent") {
      throw new BadRequestException("Campaign is already being sent or has been sent");
    }

    // 1. Resolve audience
    const audienceFilter = campaign.audienceFilter as TargetAudienceFilter | undefined;
    const recipients = await this.resolveAudience(organizationId, {
      ...audienceFilter,
      audienceType: campaign.targetAudienceType,
    });

    if (recipients.length === 0) {
      throw new BadRequestException(
        "No valid recipients found matching target audience criteria",
      );
    }

    // 2. Mark campaign as sending
    await this.db
      .update(emailCampaigns)
      .set({
        status: "sending",
        totalRecipients: recipients.length,
        updatedAt: new Date(),
      })
      .where(eq(emailCampaigns.id, campaignId));

    const apiBaseUrl = this.getApiBaseUrl();
    const appBaseUrl = this.getAppBaseUrl();

    let sentSuccessCount = 0;
    let failedCount = 0;

    // 3. Process recipients and dispatch
    for (const recipient of recipients) {
      const trackingToken = randomBytes(24).toString("hex");
      const trackingPixelUrl = `${apiBaseUrl}/api/v1/email-marketing/track/open/${trackingToken}`;
      const unsubscribeUrl = `${appBaseUrl}/marketing/unsubscribe?token=${trackingToken}`;

      // Insert recipient record first as pending
      const [recipientRecord] = await this.db
        .insert(emailCampaignRecipients)
        .values({
          campaignId,
          organizationId,
          recipientType: recipient.recipientType,
          contactId: recipient.contactId,
          leadId: recipient.leadId,
          email: recipient.email,
          name: recipient.name,
          company: recipient.company,
          status: "pending",
          trackingToken,
        })
        .returning();

      // Render personalized email
      const mergeData = {
        name: recipient.name,
        firstName: recipient.name?.split(" ")[0] || recipient.name,
        company: recipient.company,
        jobTitle: recipient.jobTitle,
        email: recipient.email,
        unsubscribeUrl,
        trackingPixelUrl,
      };

      const rendered = renderMarketingEmailHtml({
        subject: campaign.subject,
        previewText: campaign.previewText || undefined,
        bodyHtml: campaign.bodyHtml,
        bodyText: campaign.bodyText || undefined,
        design: (campaign.designConfig as EmailDesignConfig) || undefined,
        mergeData,
      });

      try {
        const mailResult = await this.mailService.sendMail({
          to: recipient.email,
          replyTo: campaign.replyTo || undefined,
          subject: campaign.subject,
          text: rendered.text,
          html: rendered.html,
        });

        sentSuccessCount++;

        // Update recipient record with sent status and Resend ID
        await this.db
          .update(emailCampaignRecipients)
          .set({
            status: "sent",
            resendEmailId: mailResult.id || undefined,
            sentAt: new Date(),
            deliveredAt: mailResult.mode === "resend" ? undefined : new Date(), // auto-delivered if local/smtp
            updatedAt: new Date(),
          })
          .where(eq(emailCampaignRecipients.id, recipientRecord.id));
      } catch (err: any) {
        failedCount++;
        this.logger.error(
          `Failed to deliver campaign email to ${recipient.email}: ${err.message}`,
        );

        await this.db
          .update(emailCampaignRecipients)
          .set({
            status: "failed",
            errorMessage: err.message,
            updatedAt: new Date(),
          })
          .where(eq(emailCampaignRecipients.id, recipientRecord.id));
      }
    }

    // 4. Update campaign final status and stats
    const finalStatus =
      failedCount === recipients.length
        ? "failed"
        : failedCount > 0
          ? "partially_sent"
          : "sent";

    const [updatedCampaign] = await this.db
      .update(emailCampaigns)
      .set({
        status: finalStatus,
        sentCount: sentSuccessCount,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailCampaigns.id, campaignId))
      .returning();

    return updatedCampaign;
  }

  // ==========================================
  // TRACKING & WEBHOOKS
  // ==========================================

  async handleResendWebhook(payload: {
    type: string;
    created_at?: string;
    data?: {
      email_id?: string;
      to?: string[];
      subject?: string;
      click?: { url?: string };
      bounce?: { message?: string };
    };
  }) {
    const resendEmailId = payload.data?.email_id;
    if (!resendEmailId) return { received: true };

    const [recipient] = await this.db
      .select()
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.resendEmailId, resendEmailId))
      .limit(1);

    if (!recipient) {
      return { received: true, matched: false };
    }

    const eventType = payload.type;
    const now = new Date();

    if (eventType === "email.delivered") {
      await this.db
        .update(emailCampaignRecipients)
        .set({
          status: "delivered",
          deliveredAt: now,
          updatedAt: now,
        })
        .where(eq(emailCampaignRecipients.id, recipient.id));

      await this.recalculateCampaignStats(recipient.campaignId);
    } else if (eventType === "email.opened") {
      await this.db
        .update(emailCampaignRecipients)
        .set({
          status: recipient.status === "clicked" ? "clicked" : "opened",
          openedAt: recipient.openedAt || now,
          openCount: sql`${emailCampaignRecipients.openCount} + 1`,
          updatedAt: now,
        })
        .where(eq(emailCampaignRecipients.id, recipient.id));

      await this.recalculateCampaignStats(recipient.campaignId);
    } else if (eventType === "email.clicked") {
      const clickedUrl = payload.data?.click?.url;
      await this.db
        .update(emailCampaignRecipients)
        .set({
          status: "clicked",
          clickedAt: recipient.clickedAt || now,
          clickCount: sql`${emailCampaignRecipients.clickCount} + 1`,
          lastClickedUrl: clickedUrl || recipient.lastClickedUrl,
          updatedAt: now,
        })
        .where(eq(emailCampaignRecipients.id, recipient.id));

      await this.recalculateCampaignStats(recipient.campaignId);
    } else if (eventType === "email.bounced" || eventType === "email.complained") {
      const errorMsg = payload.data?.bounce?.message || "Email delivery bounced";
      await this.db
        .update(emailCampaignRecipients)
        .set({
          status: "bounced",
          bouncedAt: now,
          errorMessage: errorMsg,
          updatedAt: now,
        })
        .where(eq(emailCampaignRecipients.id, recipient.id));

      await this.recalculateCampaignStats(recipient.campaignId);
    }

    return { received: true, matched: true, event: eventType };
  }

  async trackOpen(token: string) {
    if (!token) return;

    const [recipient] = await this.db
      .select()
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.trackingToken, token))
      .limit(1);

    if (!recipient) return;

    const now = new Date();
    await this.db
      .update(emailCampaignRecipients)
      .set({
        status: recipient.status === "clicked" ? "clicked" : "opened",
        openedAt: recipient.openedAt || now,
        openCount: sql`${emailCampaignRecipients.openCount} + 1`,
        updatedAt: now,
      })
      .where(eq(emailCampaignRecipients.id, recipient.id));

    await this.recalculateCampaignStats(recipient.campaignId);
  }

  async trackClick(token: string, targetUrl: string): Promise<string> {
    if (!token) return targetUrl || "/";

    const [recipient] = await this.db
      .select()
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.trackingToken, token))
      .limit(1);

    if (recipient) {
      const now = new Date();
      await this.db
        .update(emailCampaignRecipients)
        .set({
          status: "clicked",
          clickedAt: recipient.clickedAt || now,
          clickCount: sql`${emailCampaignRecipients.clickCount} + 1`,
          lastClickedUrl: targetUrl,
          updatedAt: now,
        })
        .where(eq(emailCampaignRecipients.id, recipient.id));

      await this.recalculateCampaignStats(recipient.campaignId);
    }

    return targetUrl || "/";
  }

  async handleUnsubscribe(token: string, reason?: string) {
    const [recipient] = await this.db
      .select()
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.trackingToken, token))
      .limit(1);

    if (!recipient) {
      throw new NotFoundException("Invalid or expired unsubscribe link");
    }

    // Add to unsubscribe table
    await this.db
      .insert(emailMarketingUnsubscribes)
      .values({
        organizationId: recipient.organizationId,
        email: recipient.email,
        reason: reason || "User clicked unsubscribe link",
        campaignId: recipient.campaignId,
      })
      .onConflictDoNothing();

    // Mark recipient record as unsubscribed
    await this.db
      .update(emailCampaignRecipients)
      .set({
        status: "unsubscribed",
        updatedAt: new Date(),
      })
      .where(eq(emailCampaignRecipients.id, recipient.id));

    await this.recalculateCampaignStats(recipient.campaignId);

    return {
      success: true,
      email: recipient.email,
      message: "You have been successfully unsubscribed from marketing emails.",
    };
  }

  private async recalculateCampaignStats(campaignId: string) {
    const [stats] = await this.db
      .select({
        delivered: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} in ('delivered', 'opened', 'clicked'))`,
        opened: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} in ('opened', 'clicked') or ${emailCampaignRecipients.openCount} > 0)`,
        clicked: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} = 'clicked' or ${emailCampaignRecipients.clickCount} > 0)`,
        bounced: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} = 'bounced')`,
        unsubscribed: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} = 'unsubscribed')`,
      })
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.campaignId, campaignId));

    await this.db
      .update(emailCampaigns)
      .set({
        deliveredCount: Number(stats?.delivered || 0),
        openedCount: Number(stats?.opened || 0),
        clickedCount: Number(stats?.clicked || 0),
        bouncedCount: Number(stats?.bounced || 0),
        unsubscribedCount: Number(stats?.unsubscribed || 0),
        updatedAt: new Date(),
      })
      .where(eq(emailCampaigns.id, campaignId));
  }

  // ==========================================
  // CAMPAIGN RECIPIENTS & ANALYTICS
  // ==========================================

  async getCampaignRecipients(
    organizationId: string,
    campaignId: string,
    query: {
      status?: string;
      search?: string;
      page?: number;
      perPage?: number;
    },
  ) {
    await this.getCampaign(organizationId, campaignId);

    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 25, 1), 100);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(emailCampaignRecipients.campaignId, campaignId),
      eq(emailCampaignRecipients.organizationId, organizationId),
    ];

    if (query.status) {
      filters.push(eq(emailCampaignRecipients.status, query.status as any));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(emailCampaignRecipients.name, term),
          ilike(emailCampaignRecipients.email, term),
          ilike(emailCampaignRecipients.company, term),
        )!,
      );
    }

    const [countResult] = await this.db
      .select({ total: count() })
      .from(emailCampaignRecipients)
      .where(and(...filters));

    const items = await this.db
      .select()
      .from(emailCampaignRecipients)
      .where(and(...filters))
      .orderBy(desc(emailCampaignRecipients.createdAt))
      .limit(perPage)
      .offset(offset);

    return {
      items,
      total: countResult?.total ?? 0,
      page,
      perPage,
      totalPages: Math.ceil((countResult?.total ?? 0) / perPage),
    };
  }
}
