import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';
import {
  currencies,
  customers,
  invoices,
  paymentReminderLogs,
  paymentReminderRules,
  branches,
  type Database,
} from '@frog1/db';
import { applyTemplatePlaceholders } from '@frog1/shared';
import { DATABASE, RAW_DATABASE } from '../database/database.constants';
import { databaseContext } from '../database/database-context';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { QuotationFollowupsService } from './quotation-followups.service';

interface InvoiceCandidate {
  id: string;
  number: string;
  dueDate: string | null;
  amountTotal: string;
  amountPaid: string;
  customerName: string;
  customerEmail: string | null;
  currencyCode: string;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

@Injectable()
export class ReminderJobsService implements OnModuleInit {
  private readonly logger = new Logger(ReminderJobsService.name);
  private running = false;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(RAW_DATABASE) private readonly rawDb: Database,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly quotationFollowups: QuotationFollowupsService,
  ) {}

  onModuleInit() {
    const enabled = this.config.get<string>('REMINDER_JOBS_ENABLED') !== 'false';
    if (!enabled) {
      this.logger.log('Reminder jobs disabled via REMINDER_JOBS_ENABLED=false');
      return;
    }

    const intervalMinutes = Number(
      this.config.get<string>('REMINDER_JOBS_INTERVAL_MINUTES') ?? 15,
    );

    this.logger.log(
      `Reminder jobs scheduled every ${intervalMinutes} minute(s)`,
    );

    setInterval(() => {
      void this.runDueJobs();
    }, intervalMinutes * 60 * 1000);

    setTimeout(() => {
      void this.runDueJobs();
    }, 10_000);
  }

  async runDueJobs(organizationId?: string) {
    if (this.running) {
      return { skipped: true, reason: 'Job already running' };
    }

    this.running = true;
    let sentCount = 0;

    try {
      if (!organizationId) {
        const activeBranches = await this.rawDb
          .select({
            id: branches.id,
            organizationId: branches.organizationId,
          })
          .from(branches)
          .where(eq(branches.isActive, true));

        for (const branch of activeBranches) {
          sentCount += await this.rawDb.transaction(async (transaction) => {
            await transaction.execute(sql.raw('set local role frog1_runtime'));
            await transaction.execute(
              sql`select set_config('app.organization_id', ${branch.organizationId}, true)`,
            );
            await transaction.execute(
              sql`select set_config('app.branch_id', ${branch.id}, true)`,
            );
            await transaction.execute(
              sql`select set_config('app.all_branches', 'false', true)`,
            );
            return databaseContext.run(
              transaction as unknown as Database,
              () => this.processRulesForOrganization(branch.organizationId),
            );
          });
        }
        return { success: true, sentCount };
      }

      sentCount = await this.processRulesForOrganization(organizationId);
      return { success: true, sentCount };
    } finally {
      this.running = false;
    }
  }

  private async processRulesForOrganization(organizationId: string) {
      let sentCount = 0;
      const rules = await this.db
        .select()
        .from(paymentReminderRules)
        .where(
          and(
            eq(paymentReminderRules.enabled, true),
            eq(paymentReminderRules.organizationId, organizationId),
          ),
        );

      for (const rule of rules) {
        sentCount += await this.processRule(rule);
      }

      sentCount += await this.quotationFollowups.processAutomation(organizationId);

      return sentCount;
  }

  async runRuleNow(organizationId: string, ruleId: string) {
    const [rule] = await this.db
      .select()
      .from(paymentReminderRules)
      .where(
        and(
          eq(paymentReminderRules.id, ruleId),
          eq(paymentReminderRules.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!rule) {
      return { success: false, sentCount: 0 };
    }

    const sentCount = await this.processRule(rule, true);
    return { success: true, sentCount };
  }

  private async processRule(
    rule: typeof paymentReminderRules.$inferSelect,
    force = false,
  ) {
    if (rule.triggerType === 'weekly_digest') {
      return this.processWeeklyDigest(rule, force);
    }

    if (!rule.triggerDays && rule.triggerDays !== 0) {
      return 0;
    }

    const today = startOfDay(new Date());
    const targetDueDate =
      rule.triggerType === 'days_before_due'
        ? addDays(today, rule.triggerDays)
        : addDays(today, -rule.triggerDays);

    const candidates = await this.loadInvoicesForDueDate(
      rule.organizationId,
      toIsoDate(targetDueDate),
    );

    let sentCount = 0;

    for (const invoice of candidates) {
      const sent = await this.dispatchForInvoice(rule, invoice, force);
      if (sent) {
        sentCount += 1;
      }
    }

    if (sentCount > 0 || force) {
      await this.db
        .update(paymentReminderRules)
        .set({ lastRunAt: new Date(), updatedAt: new Date() })
        .where(eq(paymentReminderRules.id, rule.id));
    }

    return sentCount;
  }

  private async processWeeklyDigest(
    rule: typeof paymentReminderRules.$inferSelect,
    force = false,
  ) {
    const now = new Date();
    const isMonday = now.getDay() === 1;
    const hour = now.getHours();

    if (!force && (!isMonday || hour < 8)) {
      return 0;
    }

    if (!force && rule.lastRunAt) {
      const lastRun = startOfDay(rule.lastRunAt);
      const weekStart = startOfDay(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      if (lastRun >= weekStart) {
        return 0;
      }
    }

    const recipient = this.resolveRecipient(rule);
    if (!recipient) {
      this.logger.warn(
        `[RULE SKIPPED] ${rule.name} has no recipient email configured`,
      );
      return 0;
    }

    const overdue = await this.loadOverdueInvoices(rule.organizationId);
    if (overdue.length === 0) {
      return 0;
    }

    const lines = overdue.map((invoice) => {
      const outstanding =
        Number(invoice.amountTotal) - Number(invoice.amountPaid);
      return `- ${invoice.number} | ${invoice.customerName} | ${formatMoney(outstanding, invoice.currencyCode)} | due ${invoice.dueDate ?? "—"}`;
    });

    const subject = `[FOLLOW-UP] Weekly receivables digest (${overdue.length} overdue)`;
    const text = [
      'Weekly overdue receivables summary:',
      '',
      ...lines,
      '',
      'Please follow up with these customers and update payment status in Frogmen.',
    ].join('\n');

    if (!force && (await this.wasDigestSentToday(rule.id))) {
      return 0;
    }

    const delivery = await this.mailService.sendBrandedMail({
      to: recipient,
      subject,
      title: `Weekly receivables digest (${overdue.length} overdue)`,
      bodyText: text,
    });

    if (!delivery.delivered) {
      return 0;
    }

    await this.db.insert(paymentReminderLogs).values({
      organizationId: rule.organizationId,
      ruleId: rule.id,
      recipientEmail: recipient,
      subject,
      customMessage: text,
    });

    await this.db
      .update(paymentReminderRules)
      .set({ lastRunAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentReminderRules.id, rule.id));

    return 1;
  }

  private async dispatchForInvoice(
    rule: typeof paymentReminderRules.$inferSelect,
    invoice: InvoiceCandidate,
    force = false,
  ) {
    const recipient = this.resolveRecipient(rule, invoice);
    if (!recipient) {
      return false;
    }

    if (!force && (await this.wasSentToday(rule.id, invoice.id))) {
      return false;
    }

    const outstanding = Math.max(
      Number(invoice.amountTotal) - Number(invoice.amountPaid),
      0,
    );

    const company = await this.settingsService.getCompany(rule.organizationId);
    const templates = await this.settingsService.getDocumentTemplates(
      rule.organizationId,
    );

    const subject =
      rule.ruleType === 'internal_follow_up'
        ? `[FOLLOW-UP] ${invoice.customerName} — invoice ${invoice.number}`
        : applyTemplatePlaceholders(templates.reminderEmailSubject, {
            number: invoice.number,
            customerName: invoice.customerName,
            companyName: company.name,
            total: String(invoice.amountTotal),
            dueDate: invoice.dueDate ?? '',
            outstanding: outstanding.toFixed(2),
          });

    const bodyText =
      rule.ruleType === 'internal_follow_up'
        ? [
            'Internal follow-up reminder',
            '',
            `Customer: ${invoice.customerName}`,
            `Invoice: ${invoice.number}`,
            `Outstanding: ${formatMoney(outstanding, invoice.currencyCode)}`,
            `Due date: ${invoice.dueDate ?? "—"}`,
            '',
            rule.description,
            '',
            'Please contact the client and record any payment updates.',
          ].join('\n')
        : applyTemplatePlaceholders(templates.reminderEmailBodyIntro, {
            number: invoice.number,
            customerName: invoice.customerName,
            companyName: company.name,
            total: String(invoice.amountTotal),
            dueDate: invoice.dueDate ?? '',
            outstanding: formatMoney(outstanding, invoice.currencyCode),
          });

    const delivery = await this.mailService.sendBrandedMail({
      to: recipient,
      subject,
      title:
        rule.ruleType === 'internal_follow_up'
          ? `Internal follow-up: ${invoice.number}`
          : `Payment reminder: ${invoice.number}`,
      bodyText,
    });

    if (!delivery.delivered) {
      return false;
    }

    await this.db.insert(paymentReminderLogs).values({
      organizationId: rule.organizationId,
      invoiceId: invoice.id,
      ruleId: rule.id,
      recipientEmail: recipient,
      subject,
      customMessage: bodyText,
    });

    return true;
  }

  private resolveRecipient(
    rule: typeof paymentReminderRules.$inferSelect,
    invoice?: InvoiceCandidate,
  ) {
    if (rule.ruleType === 'internal_follow_up') {
      return (
        rule.recipientEmail ??
        this.config.get<string>('FINANCE_TEAM_EMAIL') ??
        null
      );
    }

    return invoice?.customerEmail ?? null;
  }

  private async wasSentToday(ruleId: string, invoiceId: string) {
    const todayStart = startOfDay(new Date());

    const [existing] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(paymentReminderLogs)
      .where(
        and(
          eq(paymentReminderLogs.ruleId, ruleId),
          eq(paymentReminderLogs.invoiceId, invoiceId),
          gte(paymentReminderLogs.sentAt, todayStart),
        ),
      );

    return (existing?.total ?? 0) > 0;
  }

  private async wasDigestSentToday(ruleId: string) {
    const todayStart = startOfDay(new Date());

    const [existing] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(paymentReminderLogs)
      .where(
        and(
          eq(paymentReminderLogs.ruleId, ruleId),
          isNull(paymentReminderLogs.invoiceId),
          gte(paymentReminderLogs.sentAt, todayStart),
        ),
      );

    return (existing?.total ?? 0) > 0;
  }

  private async loadInvoicesForDueDate(
    organizationId: string,
    dueDate: string,
  ): Promise<InvoiceCandidate[]> {
    return this.db
      .select({
        id: invoices.id,
        number: invoices.number,
        dueDate: invoices.dueDate,
        amountTotal: invoices.amountTotal,
        amountPaid: invoices.amountPaid,
        customerName: customers.name,
        customerEmail: customers.email,
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
          eq(invoices.dueDate, dueDate),
          sql`${invoices.amountTotal}::numeric > ${invoices.amountPaid}::numeric`,
        ),
      );
  }

  private async loadOverdueInvoices(organizationId: string) {
    const today = toIsoDate(startOfDay(new Date()));

    return this.db
      .select({
        id: invoices.id,
        number: invoices.number,
        dueDate: invoices.dueDate,
        amountTotal: invoices.amountTotal,
        amountPaid: invoices.amountPaid,
        customerName: customers.name,
        customerEmail: customers.email,
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
          sql`${invoices.dueDate} < ${today}`,
          sql`${invoices.amountTotal}::numeric > ${invoices.amountPaid}::numeric`,
        ),
      )
      .orderBy(invoices.dueDate);
  }
}
