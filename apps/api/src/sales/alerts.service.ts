import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';
import {
  currencies,
  customers,
  invoices,
  organizations,
  paymentReminderLogs,
  paymentReminderRules,
  type Database,
} from '@frog1/db';
import { computeOutstandingInBase } from "@frog1/shared";
import { DATABASE } from '../database/database.constants';
import { MailService } from '../mail/mail.service';
import { ExchangeRatesService } from '../currencies/exchange-rates.service';

export interface InvoiceAlert {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  amountOutstanding: number;
  amountOutstandingBase: number;
  currency: string;
  dueDate: string;
  daysOverdue: number;
  severity: 'critical' | 'warning' | 'info';
  status: 'Overdue' | 'Due Soon' | 'Credit Risk';
  lastReminderSent?: string;
}

export interface AutomationRule {
  id: string;
  title: string;
  name: string;
  enabled: boolean;
  ruleType: 'customer_payment' | 'internal_follow_up';
  triggerType: 'days_before_due' | 'days_after_due' | 'weekly_digest';
  triggerDays: number | null;
  recipientEmail: string | null;
  triggerCondition: string;
  description: string;
  lastRunAt?: string;
}

const DEFAULT_RULES = [
  {
    name: 'Pre-Due Reminder (3 Days Before)',
    ruleType: 'customer_payment' as const,
    triggerType: 'days_before_due' as const,
    triggerDays: 3,
    triggerCondition: '3 days before invoice due date',
    description:
      'Auto-sends polite payment reminder email to the customer before due date',
    enabled: true,
  },
  {
    name: 'Urgent Overdue Notice (1 Day After)',
    ruleType: 'customer_payment' as const,
    triggerType: 'days_after_due' as const,
    triggerDays: 1,
    triggerCondition: '1 day after due date',
    description:
      'Auto-sends urgent payment notice to the customer accounts contact',
    enabled: true,
  },
  {
    name: 'Weekly Finance Receivables Digest',
    ruleType: 'internal_follow_up' as const,
    triggerType: 'weekly_digest' as const,
    triggerDays: null,
    triggerCondition: 'Every Monday 08:00 AM',
    description:
      'Sends your finance team a summary of overdue invoices to follow up on',
    enabled: true,
  },
  {
    name: 'Internal Follow-Up (7 Days Overdue)',
    ruleType: 'internal_follow_up' as const,
    triggerType: 'days_after_due' as const,
    triggerDays: 7,
    triggerCondition: '7 days after due date',
    description:
      'Reminds your team to follow up with the client on overdue invoices',
    enabled: false,
  },
];

const PAYMENT_REMINDER_DEFAULTS_SEEDED_KEY = 'paymentReminderDefaultsSeeded';

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function parseDateOnly(value: string | Date | null) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return startOfDay(value);
  }

  return startOfDay(new Date(`${value}T12:00:00`));
}

function differenceInDays(later: Date, earlier: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((later.getTime() - earlier.getTime()) / msPerDay);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly mailService: MailService,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  private mapAutomationRule(
    rule: typeof paymentReminderRules.$inferSelect,
  ): AutomationRule {
    return {
      id: rule.id,
      title: rule.name,
      name: rule.name,
      enabled: rule.enabled,
      ruleType: rule.ruleType,
      triggerType: rule.triggerType,
      triggerDays: rule.triggerDays,
      recipientEmail: rule.recipientEmail,
      triggerCondition: rule.triggerCondition,
      description: rule.description,
      lastRunAt: rule.lastRunAt?.toISOString(),
    };
  }

  private parseOrgMetadata(metadata: string | null) {
    if (!metadata) {
      return {} as Record<string, unknown>;
    }

    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  }

  private async hasPaymentReminderDefaultsSeeded(organizationId: string) {
    const [org] = await this.db
      .select({ metadata: organizations.metadata })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    return (
      this.parseOrgMetadata(org?.metadata ?? null)[
        PAYMENT_REMINDER_DEFAULTS_SEEDED_KEY
      ] === true
    );
  }

  private async markPaymentReminderDefaultsSeeded(organizationId: string) {
    const [org] = await this.db
      .select({ metadata: organizations.metadata })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const metadata = this.parseOrgMetadata(org?.metadata ?? null);

    if (metadata[PAYMENT_REMINDER_DEFAULTS_SEEDED_KEY] === true) {
      return;
    }

    await this.db
      .update(organizations)
      .set({
        metadata: JSON.stringify({
          ...metadata,
          [PAYMENT_REMINDER_DEFAULTS_SEEDED_KEY]: true,
        }),
      })
      .where(eq(organizations.id, organizationId));
  }

  private async ensureDefaultRules(organizationId: string) {
    if (await this.hasPaymentReminderDefaultsSeeded(organizationId)) {
      return;
    }

    const [existing] = await this.db
      .select({ total: count() })
      .from(paymentReminderRules)
      .where(eq(paymentReminderRules.organizationId, organizationId));

    if ((existing?.total ?? 0) > 0) {
      await this.markPaymentReminderDefaultsSeeded(organizationId);
      return;
    }

    await this.db.insert(paymentReminderRules).values(
      DEFAULT_RULES.map((rule) => ({
        organizationId,
        name: rule.name,
        ruleType: rule.ruleType,
        triggerType: rule.triggerType,
        triggerDays: rule.triggerDays,
        triggerCondition: rule.triggerCondition,
        description: rule.description,
        enabled: rule.enabled,
      })),
    );

    await this.markPaymentReminderDefaultsSeeded(organizationId);
  }

  private async removeDemoInvoices(organizationId: string) {
    const demoNumbers = [
      'INV-2026-089',
      'INV-2026-087',
      'INV-2026-094',
      'INV-2026-098',
    ];

    const deleted = await this.db
      .delete(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          inArray(invoices.number, demoNumbers),
        ),
      )
      .returning({ id: invoices.id });

    if (deleted.length > 0) {
      this.logger.log(
        `[DEMO CLEANUP] Removed ${deleted.length} seeded demo invoices for org ${organizationId}`,
      );
    }
  }

  private classifyAlert(
    dueDate: Date,
    today: Date,
    daysOverdue: number,
    creditApproved: boolean,
  ): Pick<InvoiceAlert, 'status' | 'severity'> {
    if (daysOverdue > 30 || (daysOverdue > 0 && !creditApproved && daysOverdue >= 14)) {
      return { status: 'Credit Risk', severity: 'critical' };
    }

    if (daysOverdue > 0) {
      return {
        status: 'Overdue',
        severity: daysOverdue >= 7 ? 'critical' : 'warning',
      };
    }

    const daysUntilDue = differenceInDays(dueDate, today);
    return {
      status: 'Due Soon',
      severity: daysUntilDue <= 3 ? 'warning' : 'info',
    };
  }

  private async buildAlerts(organizationId: string): Promise<InvoiceAlert[]> {
    const today = startOfDay(new Date());
    const dueSoonLimit = new Date(today);
    dueSoonLimit.setDate(dueSoonLimit.getDate() + 7);

    const [organization] = await this.db
      .select({ baseCurrencyId: organizations.baseCurrencyId })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const rows = await this.db
      .select({
        id: invoices.id,
        number: invoices.number,
        dueDate: invoices.dueDate,
        amountTotal: invoices.amountTotal,
        amountPaid: invoices.amountPaid,
        amountTotalBase: invoices.amountTotalBase,
        exchangeRate: invoices.exchangeRate,
        invoiceDate: invoices.invoiceDate,
        currencyId: invoices.currencyId,
        customerName: customers.name,
        customerEmail: customers.email,
        creditApproved: customers.creditApproved,
        currencyCode: currencies.code,
      })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .innerJoin(currencies, eq(currencies.id, invoices.currencyId))
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.state, 'posted'),
          inArray(invoices.paymentState, ['unpaid', 'partial']),
          isNull(invoices.deletedAt),
          isNotNull(invoices.dueDate),
          sql`${invoices.amountTotal}::numeric > ${invoices.amountPaid}::numeric`,
          lte(invoices.dueDate, toIsoDate(dueSoonLimit)),
        ),
      )
      .orderBy(invoices.dueDate);

    const invoiceIds = rows.map((row) => row.id);
    const reminderMap = new Map<string, string>();

    if (invoiceIds.length > 0) {
      const reminderRows = await this.db
        .select({
          invoiceId: paymentReminderLogs.invoiceId,
          sentAt: paymentReminderLogs.sentAt,
        })
        .from(paymentReminderLogs)
        .where(
          and(
            eq(paymentReminderLogs.organizationId, organizationId),
            inArray(paymentReminderLogs.invoiceId, invoiceIds),
          ),
        )
        .orderBy(desc(paymentReminderLogs.sentAt));

      for (const reminder of reminderRows) {
        if (!reminder.invoiceId) {
          continue;
        }

        if (!reminderMap.has(reminder.invoiceId)) {
          reminderMap.set(reminder.invoiceId, reminder.sentAt.toISOString());
        }
      }
    }

    const alerts: InvoiceAlert[] = [];

    for (const row of rows) {
      const dueDate = parseDateOnly(row.dueDate);
      if (!dueDate) {
        continue;
      }

      const daysUntilDue = differenceInDays(dueDate, today);
      const daysOverdue = daysUntilDue < 0 ? -daysUntilDue : 0;

      if (daysUntilDue > 7) {
        continue;
      }

      const amountTotal = Number(row.amountTotal);
      const amountPaid = Number(row.amountPaid);
      const storedExchangeRate = Number(row.exchangeRate);
      let exchangeRate = Number.isFinite(storedExchangeRate)
        ? storedExchangeRate
        : 1;

      if (
        organization?.baseCurrencyId &&
        row.currencyId !== organization.baseCurrencyId
      ) {
        const currentRate = await this.exchangeRatesService
          .getRequiredRate(
            organizationId,
            row.currencyId,
            organization.baseCurrencyId,
            row.invoiceDate,
          )
          .catch(() => null);
        if (currentRate != null && currentRate > 0) {
          exchangeRate = currentRate;
        }
      } else if (organization?.baseCurrencyId === row.currencyId) {
        exchangeRate = 1;
      }
      const amountOutstanding = Math.max(amountTotal - amountPaid, 0);

      if (!Number.isFinite(amountOutstanding) || amountOutstanding <= 0) {
        continue;
      }

      const amountOutstandingBase = computeOutstandingInBase({
        amountTotal,
        amountPaid,
        // Recalculate alert KPIs from the document outstanding using the
        // organization's current base currency. Legacy invoices may have been
        // posted before the base currency was configured and contain a stale
        // amountTotalBase at rate 1.
        amountTotalBase: amountTotal * exchangeRate,
        exchangeRate: Number.isFinite(exchangeRate) ? exchangeRate : null,
      });

      if (amountOutstandingBase <= 0) {
        continue;
      }

      const classification = this.classifyAlert(
        dueDate,
        today,
        daysOverdue,
        row.creditApproved,
      );

      alerts.push({
        id: row.id,
        invoiceId: row.id,
        invoiceNumber: row.number,
        customerName: row.customerName,
        customerEmail: row.customerEmail ?? '',
        amount: amountTotal,
        amountOutstanding,
        amountOutstandingBase,
        currency: row.currencyCode,
        dueDate: toIsoDate(dueDate),
        daysOverdue,
        ...classification,
        lastReminderSent: reminderMap.get(row.id),
      });
    }

    return alerts.sort((left, right) => {
      if (left.status === right.status) {
        return left.dueDate.localeCompare(right.dueDate);
      }

      const order = { Overdue: 0, 'Credit Risk': 1, 'Due Soon': 2 };
      return order[left.status] - order[right.status];
    });
  }

  async getAlertsSummary(organizationId: string) {
    await this.ensureDefaultRules(organizationId);
    await this.removeDemoInvoices(organizationId);

    const [alerts, ruleRows] = await Promise.all([
      this.buildAlerts(organizationId),
      this.db
        .select()
        .from(paymentReminderRules)
        .where(eq(paymentReminderRules.organizationId, organizationId))
        .orderBy(paymentReminderRules.createdAt),
    ]);

    const weekStart = startOfDay(new Date());
    weekStart.setDate(weekStart.getDate() - 7);

    const [reminderCount] = await this.db
      .select({ total: count() })
      .from(paymentReminderLogs)
      .where(
        and(
          eq(paymentReminderLogs.organizationId, organizationId),
          gte(paymentReminderLogs.sentAt, weekStart),
        ),
      );

    const overdueAlerts = alerts.filter((alert) => alert.status === 'Overdue' || alert.status === 'Credit Risk');
    const dueSoonAlerts = alerts.filter((alert) => alert.status === 'Due Soon');

    const automationRules: AutomationRule[] = ruleRows.map((rule) =>
      this.mapAutomationRule(rule),
    );

    return {
      alerts,
      automationRules,
      metrics: {
        totalOverdueAmount: overdueAlerts.reduce(
          (sum, alert) => sum + alert.amountOutstandingBase,
          0,
        ),
        totalOverdueCount: overdueAlerts.length,
        totalDueSoonAmount: dueSoonAlerts.reduce(
          (sum, alert) => sum + alert.amountOutstandingBase,
          0,
        ),
        totalDueSoonCount: dueSoonAlerts.length,
        remindersSentThisWeek: reminderCount?.total ?? 0,
        activeAutomationRulesCount: automationRules.filter((rule) => rule.enabled)
          .length,
        totalAutomationRulesCount: automationRules.length,
      },
    };
  }

  async getOverdueCount(organizationId: string) {
    await this.removeDemoInvoices(organizationId);
    const alerts = await this.buildAlerts(organizationId);
    return alerts.filter(
      (alert) => alert.status === 'Overdue' || alert.status === 'Credit Risk',
    ).length;
  }

  async resendPaymentReminder(
    organizationId: string,
    dto: {
      alertId: string;
      customerEmail: string;
      customMessage?: string;
    },
  ) {
    const [invoice] = await this.db
      .select({
        id: invoices.id,
        number: invoices.number,
        customerEmail: customers.email,
      })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(
        and(
          eq(invoices.id, dto.alertId),
          eq(invoices.organizationId, organizationId),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);

    if (!invoice) {
      throw new NotFoundException(`Invoice alert ${dto.alertId} not found`);
    }

    const recipientEmail = dto.customerEmail || invoice.customerEmail || '';

    if (!recipientEmail) {
      throw new NotFoundException('Customer email is required to send a reminder');
    }

    const subject = `[PAYMENT REMINDER] Invoice ${invoice.number}`;
    const text = [
      dto.customMessage,
      '',
      `Payment reminder for invoice ${invoice.number}.`,
    ]
      .filter(Boolean)
      .join('\n');

    await this.mailService.sendMail({
      to: recipientEmail,
      subject,
      text,
    });

    const [log] = await this.db
      .insert(paymentReminderLogs)
      .values({
        organizationId,
        invoiceId: invoice.id,
        recipientEmail,
        subject,
        customMessage: dto.customMessage ?? text,
      })
      .returning();

    this.logger.log(
      `[EMAIL SENT] Payment reminder for ${invoice.number} dispatched to ${recipientEmail}`,
    );

    return {
      success: true,
      message: `Payment reminder email successfully dispatched to ${recipientEmail}`,
      dispatchedAt: log.sentAt.toISOString(),
      invoiceNumber: invoice.number,
      recipient: recipientEmail,
      lastReminderSent: log.sentAt.toISOString(),
    };
  }

  async createAutomationRule(
    organizationId: string,
    dto: {
      name: string;
      ruleType: 'customer_payment' | 'internal_follow_up';
      triggerType: 'days_before_due' | 'days_after_due' | 'weekly_digest';
      triggerDays?: number | null;
      recipientEmail?: string | null;
      triggerCondition: string;
      description: string;
    },
  ) {
    const [rule] = await this.db
      .insert(paymentReminderRules)
      .values({
        organizationId,
        name: dto.name,
        ruleType: dto.ruleType,
        triggerType: dto.triggerType,
        triggerDays: dto.triggerDays ?? null,
        recipientEmail: dto.recipientEmail ?? null,
        triggerCondition: dto.triggerCondition,
        description: dto.description,
        enabled: true,
      })
      .returning();

    await this.markPaymentReminderDefaultsSeeded(organizationId);

    return {
      success: true,
      rule: this.mapAutomationRule(rule),
    };
  }

  async deleteAutomationRule(organizationId: string, id: string) {
    const [deleted] = await this.db
      .delete(paymentReminderRules)
      .where(
        and(
          eq(paymentReminderRules.id, id),
          eq(paymentReminderRules.organizationId, organizationId),
        ),
      )
      .returning();

    if (!deleted) {
      throw new NotFoundException(`Rule with ID ${id} not found`);
    }

    await this.markPaymentReminderDefaultsSeeded(organizationId);

    this.logger.log(`[RULE DELETED] ${deleted.name}`);
    return { success: true, deletedId: id };
  }

  async toggleAutomationRule(
    organizationId: string,
    ruleId: string,
    enabled: boolean,
  ) {
    const [rule] = await this.db
      .update(paymentReminderRules)
      .set({ enabled, updatedAt: new Date() })
      .where(
        and(
          eq(paymentReminderRules.id, ruleId),
          eq(paymentReminderRules.organizationId, organizationId),
        ),
      )
      .returning();

    if (!rule) {
      throw new NotFoundException(`Rule with ID ${ruleId} not found`);
    }

    return {
      success: true,
      rule: this.mapAutomationRule(rule),
    };
  }
}
