import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  currencies,
  customers,
  organizations,
  salesActivities,
  salesOrders,
  type Database,
} from "@frog1/db";
import { DATABASE } from "../database/database.constants";
import { MailService } from "../mail/mail.service";
import { SettingsService } from "../settings/settings.service";

export interface QuotationFollowupSettings {
  customerAutomationEnabled: boolean;
  customerFollowupDays: number[];
  internalAutomationEnabled: boolean;
  internalReminderAfterDays: number;
  customerSubject: string;
  customerMessage: string;
}

const DEFAULT_SETTINGS: QuotationFollowupSettings = {
  customerAutomationEnabled: false,
  customerFollowupDays: [3, 7],
  internalAutomationEnabled: false,
  internalReminderAfterDays: 3,
  customerSubject: "Following up on quotation {{number}}",
  customerMessage:
    "Hello {{customerName}},\n\nWe are following up on quotation {{number}}, sent on {{sentDate}}. Please let us know if you have any questions. You can review and sign it using the link below.",
};

function parseMetadata(metadata: string | null) {
  try {
    return metadata ? (JSON.parse(metadata) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function dayDifference(from: Date, to = new Date()) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function applyTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
}

@Injectable()
export class QuotationFollowupsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly mail: MailService,
    private readonly settingsService: SettingsService,
  ) {}

  async getSettings(organizationId: string) {
    const [org] = await this.db
      .select({ metadata: organizations.metadata })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    const stored = parseMetadata(org?.metadata ?? null).quotationFollowups as
      | Partial<QuotationFollowupSettings>
      | undefined;
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async updateSettings(
    organizationId: string,
    input: Partial<QuotationFollowupSettings>,
  ) {
    const [org] = await this.db
      .select({ metadata: organizations.metadata })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    const metadata = parseMetadata(org?.metadata ?? null);
    const current = await this.getSettings(organizationId);
    const customerFollowupDays = (input.customerFollowupDays ?? current.customerFollowupDays)
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 90)
      .filter((day, index, values) => values.indexOf(day) === index)
      .sort((a, b) => a - b);
    const next: QuotationFollowupSettings = {
      ...current,
      ...input,
      customerFollowupDays,
      internalReminderAfterDays: Math.min(
        90,
        Math.max(1, Number(input.internalReminderAfterDays ?? current.internalReminderAfterDays)),
      ),
    };
    await this.db
      .update(organizations)
      .set({ metadata: JSON.stringify({ ...metadata, quotationFollowups: next }) })
      .where(eq(organizations.id, organizationId));
    return next;
  }

  async getQueue(organizationId: string) {
    const rows = await this.db
      .select({
        id: salesOrders.id,
        number: salesOrders.number,
        state: salesOrders.state,
        sentAt: salesOrders.sentAt,
        validityDate: salesOrders.validityDate,
        amountTotal: salesOrders.amountTotal,
        accessToken: salesOrders.accessToken,
        customerName: customers.name,
        customerEmail: customers.email,
        currencyCode: currencies.code,
      })
      .from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .innerJoin(currencies, eq(currencies.id, salesOrders.currencyId))
      .where(
        and(
          eq(salesOrders.organizationId, organizationId),
          inArray(salesOrders.state, ["sent", "signed"]),
          isNull(salesOrders.deletedAt),
        ),
      )
      .orderBy(desc(salesOrders.sentAt));

    const ids = rows.map((row) => row.id);
    const activities = ids.length
      ? await this.db
          .select()
          .from(salesActivities)
          .where(
            and(
              eq(salesActivities.organizationId, organizationId),
              inArray(salesActivities.entityId, ids),
              eq(salesActivities.activityType, "sent"),
            ),
          )
          .orderBy(desc(salesActivities.createdAt))
      : [];

    return rows.map((row) => {
      const followups = activities.filter(
        (activity) =>
          activity.entityId === row.id &&
          (activity.metadata as { kind?: string } | null)?.kind === "quotation_followup",
      );
      return {
        ...row,
        daysSinceSent: row.sentAt ? dayDifference(row.sentAt) : 0,
        followupCount: followups.length,
        lastFollowupAt: followups[0]?.createdAt.toISOString() ?? null,
      };
    });
  }

  async sendFollowup(
    organizationId: string,
    userId: string | undefined,
    input: { quotationId: string; recipientEmail: string; subject: string; message: string },
    automationKey?: string,
  ) {
    const [quotation] = await this.db
      .select({
        id: salesOrders.id,
        number: salesOrders.number,
        state: salesOrders.state,
        accessToken: salesOrders.accessToken,
        customerName: customers.name,
      })
      .from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(
        and(
          eq(salesOrders.id, input.quotationId),
          eq(salesOrders.organizationId, organizationId),
          isNull(salesOrders.deletedAt),
        ),
      )
      .limit(1);
    if (!quotation) throw new NotFoundException("Quotation not found");
    if (quotation.state !== "sent") {
      throw new BadRequestException("Only sent, unsigned quotations need customer follow-up");
    }
    const recipient = input.recipientEmail.trim();
    if (!recipient) throw new BadRequestException("Recipient email is required");
    const branding = await this.settingsService.getOrganizationBranding(organizationId);
    const delivery = await this.mail.sendBrandedMail({
      to: recipient,
      replyTo:
        branding.companyProfile.replyToEmail || branding.companyProfile.email || undefined,
      brandName: branding.name,
      logoUrl: branding.logoUrl,
      subject: input.subject.trim(),
      title: `Quotation follow-up: ${quotation.number}`,
      bodyText: input.message.trim(),
      ctaLabel: "Review and sign quotation",
      ctaUrl: quotation.accessToken
        ? `${process.env.WEB_URL ?? "http://localhost:3000"}/quotations/public/${quotation.accessToken}`
        : undefined,
    });
    if (!delivery.delivered) {
      throw new BadRequestException("Email delivery is not configured or the message could not be delivered");
    }
    await this.db.insert(salesActivities).values({
      organizationId,
      entityType: "sales_order",
      entityId: quotation.id,
      userId: userId ?? null,
      activityType: "sent",
      message: `Quotation follow-up sent to ${recipient}`,
      metadata: {
        kind: "quotation_followup",
        recipient,
        subject: input.subject.trim(),
        automationKey: automationKey ?? null,
      },
    });
    return { success: true, recipient, quotationNumber: quotation.number };
  }

  async processAutomation(organizationId: string) {
    const settings = await this.getSettings(organizationId);
    const queue = await this.getQueue(organizationId);
    let sentCount = 0;
    if (settings.customerAutomationEnabled) {
      for (const quotation of queue.filter((item) => item.state === "sent")) {
        if (!quotation.customerEmail || !quotation.sentAt) continue;
        const daysWaiting = dayDifference(quotation.sentAt);
        const existingRows = await this.db
          .select({ id: salesActivities.id, metadata: salesActivities.metadata })
          .from(salesActivities)
          .where(and(eq(salesActivities.entityId, quotation.id), eq(salesActivities.activityType, "sent")));
        const day = [...settings.customerFollowupDays]
          .sort((a, b) => b - a)
          .find(
            (candidate) =>
              candidate <= daysWaiting &&
              !existingRows.some(
                (row) =>
                  (row.metadata as { automationKey?: string } | null)
                    ?.automationKey === `customer-day-${candidate}`,
              ),
          );
        if (!day) continue;
        const key = `customer-day-${day}`;
        const values = {
          number: quotation.number,
          customerName: quotation.customerName,
          sentDate: quotation.sentAt.toISOString().slice(0, 10),
        };
        try {
          await this.sendFollowup(
            organizationId,
            undefined,
            {
              quotationId: quotation.id,
              recipientEmail: quotation.customerEmail,
              subject: applyTemplate(settings.customerSubject, values),
              message: applyTemplate(settings.customerMessage, values),
            },
            key,
          );
          sentCount += 1;
        } catch {
          // One delivery failure must not stop the remaining organizations or quotations.
        }
      }
    }

    if (settings.internalAutomationEnabled) {
      const due = queue.filter(
        (item) => item.state === "sent" && item.daysSinceSent >= settings.internalReminderAfterDays,
      );
      const branding = await this.settingsService.getOrganizationBranding(organizationId);
      const recipients = branding.companyProfile.alertEmails;
      if (due.length && recipients.length) {
        const todayKey = `internal-${new Date().toISOString().slice(0, 10)}`;
        const priorRows = await this.db
          .select({ metadata: salesActivities.metadata })
          .from(salesActivities)
          .where(
            and(
              eq(salesActivities.entityId, due[0].id),
              eq(salesActivities.activityType, "sent"),
            ),
          );
        if (
          priorRows.some(
            (row) =>
              (row.metadata as { automationKey?: string } | null)?.automationKey === todayKey,
          )
        ) return sentCount;
        const text = [
          `${due.length} quotation(s) need sales follow-up:`,
          "",
          ...due.map((item) => `- ${item.number} | ${item.customerName} | ${item.daysSinceSent} days since sent`),
        ].join("\n");
        let internalDelivered = 0;
        for (const recipient of recipients) {
          const delivery = await this.mail.sendBrandedMail({
            to: recipient,
            replyTo:
              branding.companyProfile.replyToEmail ||
              branding.companyProfile.email ||
              undefined,
            brandName: branding.name,
            logoUrl: branding.logoUrl,
            subject: `[FOLLOW-UP] ${due.length} quotation(s) need attention`,
            title: "Quotation follow-up reminder",
            bodyText: text,
          });
          if (delivery.delivered) {
            internalDelivered += 1;
            sentCount += 1;
          }
        }
        if (internalDelivered > 0) {
          await this.db.insert(salesActivities).values({
            organizationId,
            entityType: "sales_order",
            entityId: due[0].id,
            userId: null,
            activityType: "sent",
            message: `Internal quotation follow-up digest sent to ${recipients.join(", ")}`,
            metadata: { kind: "quotation_followup", automationKey: todayKey },
          });
        }
      }
    }
    return sentCount;
  }
}
