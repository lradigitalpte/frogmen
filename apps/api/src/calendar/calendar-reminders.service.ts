import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import {
  calendarEvents,
  calendarReminderLogs,
  calendarSettings,
  type Database,
} from "@frog1/db";
import {
  parseEmailList,
  type CalendarItem,
  type CalendarSource,
} from "@frog1/shared";
import { DATABASE, RAW_DATABASE } from "../database/database.constants";
import { databaseContext } from "../database/database-context";
import { MailService } from "../mail/mail.service";
import { SettingsService } from "../settings/settings.service";
import { addDaysIso, daysBetween, todayIso } from "./calendar-dates";
import {
  CalendarService,
  type ResolvedCalendarSettings,
} from "./calendar.service";

function formatDay(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function describeWhen(isoDate: string, today: string) {
  const diff = daysBetween(today, isoDate);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff} days (${formatDay(isoDate)})`;
}

function itemLine(item: CalendarItem) {
  const time = item.startTime ? ` ${item.startTime}` : "";
  const subtitle = item.subtitle ? ` — ${item.subtitle}` : "";
  return `• ${item.title}${subtitle}${time}`;
}

@Injectable()
export class CalendarRemindersService implements OnModuleInit {
  private readonly logger = new Logger(CalendarRemindersService.name);
  private running = false;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(RAW_DATABASE) private readonly rawDb: Database,
    private readonly calendar: CalendarService,
    private readonly mailService: MailService,
    private readonly settingsService: SettingsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>("REMINDER_JOBS_ENABLED") === "false") {
      return;
    }

    const intervalMinutes = Number(
      this.config.get<string>("REMINDER_JOBS_INTERVAL_MINUTES") ?? 15,
    );

    setInterval(() => {
      void this.runDueReminders();
    }, intervalMinutes * 60 * 1000);

    setTimeout(() => {
      void this.runDueReminders();
    }, 20_000);
  }

  async runDueReminders() {
    if (this.running) return;
    this.running = true;

    try {
      const organizationIds = await this.organizationsWithReminders();

      for (const organizationId of organizationIds) {
        try {
          await this.inOrganizationContext(organizationId, () =>
            this.processOrganization(organizationId),
          );
        } catch (error) {
          this.logger.error(
            `Calendar reminders failed for ${organizationId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Sends today's digest immediately, ignoring the schedule and dedupe log. */
  async sendDigestNow(organizationId: string) {
    const settings = await this.calendar.getSettings(organizationId);
    const recipients = parseEmailList(settings.reminderEmails ?? "");

    if (!recipients.length) {
      return {
        sent: 0,
        recipients: [],
        itemCount: 0,
        message: "Add at least one reminder email address in calendar settings.",
      };
    }

    const digest = await this.buildDigest(settings);
    let sent = 0;
    for (const to of recipients) {
      if (await this.sendDigestEmail(settings, to, digest)) sent += 1;
    }

    return { sent, recipients, itemCount: digest.itemCount, message: null };
  }

  private async organizationsWithReminders() {
    const rows = await this.rawDb.execute<{ organization_id: string }>(sql`
      select organization_id from ${calendarSettings}
      where reminders_enabled = true
      union
      select distinct organization_id from ${calendarEvents}
      where reminder_days_before is not null and deleted_at is null
    `);

    return (rows as unknown as Array<{ organization_id: string }>).map(
      (row) => row.organization_id,
    );
  }

  private async inOrganizationContext<T>(
    organizationId: string,
    run: () => Promise<T>,
  ) {
    return this.rawDb.transaction(async (transaction) => {
      await transaction.execute(sql.raw("set local role frog1_runtime"));
      await transaction.execute(
        sql`select set_config('app.organization_id', ${organizationId}, true)`,
      );
      await transaction.execute(
        sql`select set_config('app.all_branches', 'true', true)`,
      );
      return databaseContext.run(transaction as unknown as Database, run);
    });
  }

  private async processOrganization(organizationId: string) {
    const settings = await this.calendar.getSettings(organizationId);
    if (!settings.remindersEnabled) return;
    if (new Date().getHours() < settings.digestHour) return;

    await this.processEventReminders(settings);
    await this.processDailyDigest(settings);
  }

  private async processEventReminders(settings: ResolvedCalendarSettings) {
    const today = todayIso();
    const events = await this.db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.organizationId, settings.organizationId),
          isNull(calendarEvents.deletedAt),
          isNotNull(calendarEvents.reminderDaysBefore),
          gte(calendarEvents.startDate, today),
          lte(calendarEvents.startDate, addDaysIso(today, 366)),
        ),
      );

    for (const event of events) {
      if (daysBetween(today, event.startDate) !== event.reminderDaysBefore) {
        continue;
      }

      const recipients = parseEmailList(
        event.reminderEmails ?? settings.reminderEmails ?? "",
      );
      const when = describeWhen(event.startDate, today);
      const subject = `Reminder: ${event.title} ${when}`.slice(0, 255);
      const time = event.startTime
        ? ` at ${event.startTime}${event.endTime ? `–${event.endTime}` : ""}`
        : "";

      const bodyText = [
        `${event.title} is ${when}${time}.`,
        "",
        `Date: ${formatDay(event.startDate)}${
          event.endDate && event.endDate !== event.startDate
            ? ` → ${formatDay(event.endDate)}`
            : ""
        }`,
        ...(event.description ? ["", event.description] : []),
      ].join("\n");

      for (const to of recipients) {
        await this.sendOnce(
          settings.organizationId,
          `event:${event.id}:${event.startDate}:${event.reminderDaysBefore}:${to}`,
          to,
          subject,
          () =>
            this.sendMail(settings.organizationId, {
              to,
              subject,
              title: `Reminder: ${event.title}`,
              bodyText,
            }),
        );
      }
    }
  }

  private async processDailyDigest(settings: ResolvedCalendarSettings) {
    const recipients = parseEmailList(settings.reminderEmails ?? "");
    if (!recipients.length) return;

    const digest = await this.buildDigest(settings);
    if (digest.itemCount === 0) return;

    const today = todayIso();
    for (const to of recipients) {
      await this.sendOnce(
        settings.organizationId,
        `digest:${today}:${to}`,
        to,
        digest.subject,
        () => this.sendDigestEmail(settings, to, digest),
      );
    }
  }

  private async buildDigest(settings: ResolvedCalendarSettings) {
    const today = todayIso();
    const sources: CalendarSource[] = ["event"];
    if (settings.includeDeliveries) sources.push("purchase_order");
    if (settings.includeInvoices)
      sources.push("invoice_due", "quotation_expiry", "warranty_expiry");
    if (settings.includeAnniversaries)
      sources.push("customer_anniversary", "vendor_anniversary");
    if (settings.includeHolidays) sources.push("holiday");

    const [items, overdue] = await Promise.all([
      this.calendar.listItems(settings.organizationId, {
        from: today,
        to: addDaysIso(today, settings.digestLookaheadDays),
        sources,
      }),
      settings.includeDeliveries
        ? this.calendar.overdueDeliveries(settings.organizationId)
        : Promise.resolve([] as CalendarItem[]),
    ]);

    // Paid invoices and completed deliveries don't need attention.
    const actionable = items.filter(
      (item) => item.status !== "paid" && item.status !== "done",
    );

    const byDay = new Map<string, CalendarItem[]>();
    for (const item of actionable) {
      const list = byDay.get(item.date) ?? [];
      list.push(item);
      byDay.set(item.date, list);
    }

    const lines: string[] = [];
    for (const [date, dayItems] of byDay) {
      const when = describeWhen(date, today);
      lines.push(`${when.charAt(0).toUpperCase()}${when.slice(1)}:`);
      lines.push(...dayItems.map(itemLine));
      lines.push("");
    }

    if (overdue.length) {
      lines.push(`Overdue deliveries (${overdue.length}):`);
      lines.push(
        ...overdue.map(
          (item) => `${itemLine(item)} — expected ${formatDay(item.date)}`,
        ),
      );
      lines.push("");
    }

    const itemCount = actionable.length + overdue.length;
    const todayCount = byDay.get(today)?.length ?? 0;

    return {
      itemCount,
      subject: `Calendar: ${todayCount} today, ${itemCount} item${
        itemCount === 1 ? "" : "s"
      } need attention`,
      bodyText: itemCount
        ? lines.join("\n").trim()
        : `Nothing on the calendar for the next ${settings.digestLookaheadDays} day(s).`,
    };
  }

  private sendDigestEmail(
    settings: ResolvedCalendarSettings,
    to: string,
    digest: { subject: string; bodyText: string },
  ) {
    return this.sendMail(settings.organizationId, {
      to,
      subject: digest.subject,
      title: `Your calendar for ${formatDay(todayIso())}`,
      bodyText: digest.bodyText,
    });
  }

  private async sendMail(
    organizationId: string,
    input: { to: string; subject: string; title: string; bodyText: string },
  ) {
    const company = await this.settingsService
      .getCompany(organizationId)
      .catch(() => null);
    const webUrl = this.config.get<string>("WEB_URL") ?? "http://localhost:3000";

    const delivery = await this.mailService.sendBrandedMail({
      ...input,
      brandName: company?.name ?? undefined,
      ctaLabel: "Open calendar",
      ctaUrl: `${webUrl}/dashboard/calendar`,
    });

    return delivery.delivered;
  }

  /**
   * Claims the reminder key before sending so the same reminder never goes out
   * twice; releases it again when delivery fails so the next run retries.
   */
  private async sendOnce(
    organizationId: string,
    reminderKey: string,
    recipientEmail: string,
    subject: string,
    send: () => Promise<boolean>,
  ) {
    const claimed = await this.db
      .insert(calendarReminderLogs)
      .values({
        organizationId,
        reminderKey: reminderKey.slice(0, 255),
        recipientEmail,
        subject: subject.slice(0, 255),
      })
      .onConflictDoNothing()
      .returning({ id: calendarReminderLogs.id });

    if (!claimed.length) return false;

    const delivered = await send().catch(() => false);
    if (!delivered) {
      await this.db
        .delete(calendarReminderLogs)
        .where(eq(calendarReminderLogs.id, claimed[0].id));
    }

    return delivered;
  }
}
