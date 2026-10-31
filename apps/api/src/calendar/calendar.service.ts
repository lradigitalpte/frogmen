import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import {
  calendarEvents,
  calendarSettings,
  customers,
  goodsReceipts,
  invoices,
  purchaseOrders,
  salesOrders,
  vendors,
  warrantyRegistrations,
  type Database,
} from "@frog1/db";
import type {
  CalendarItem,
  CalendarItemStatus,
  CalendarSource,
  CreateCalendarEventInput,
  ListCalendarEventsQuery,
  UpdateCalendarEventInput,
  UpdateCalendarSettingsInput,
} from "@frog1/shared";
import { DATABASE } from "../database/database.constants";
import { anniversariesInRange, ordinal, todayIso } from "./calendar-dates";
import { HolidaysService } from "./holidays.service";

export const ALL_CALENDAR_SOURCES: CalendarSource[] = [
  "event",
  "holiday",
  "purchase_order",
  "goods_receipt",
  "invoice_due",
  "quotation_expiry",
  "warranty_expiry",
  "customer_anniversary",
  "vendor_anniversary",
];

export interface ResolvedCalendarSettings {
  organizationId: string;
  trackedCountries: string[];
  remindersEnabled: boolean;
  reminderEmails: string | null;
  digestLookaheadDays: number;
  digestHour: number;
  includeDeliveries: boolean;
  includeAnniversaries: boolean;
  includeHolidays: boolean;
  includeInvoices: boolean;
}

function dueStatus(date: string, today: string): CalendarItemStatus {
  if (date < today) return "overdue";
  if (date === today) return "today";
  return "upcoming";
}

@Injectable()
export class CalendarService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly holidays: HolidaysService,
  ) {}

  // ── Settings ──────────────────────────────────────────────

  async getSettings(organizationId: string): Promise<ResolvedCalendarSettings> {
    const [row] = await this.db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.organizationId, organizationId))
      .limit(1);

    return {
      organizationId,
      trackedCountries: row?.trackedCountries ?? [],
      remindersEnabled: row?.remindersEnabled ?? true,
      reminderEmails: row?.reminderEmails ?? null,
      digestLookaheadDays: row?.digestLookaheadDays ?? 3,
      digestHour: row?.digestHour ?? 7,
      includeDeliveries: row?.includeDeliveries ?? true,
      includeAnniversaries: row?.includeAnniversaries ?? true,
      includeHolidays: row?.includeHolidays ?? true,
      includeInvoices: row?.includeInvoices ?? true,
    };
  }

  async updateSettings(
    organizationId: string,
    input: UpdateCalendarSettingsInput,
  ) {
    const trackedCountries = input.trackedCountries
      ? [...new Set(input.trackedCountries)].filter((code) =>
          this.holidays.isSupported(code),
        )
      : undefined;

    const values = {
      ...(trackedCountries !== undefined ? { trackedCountries } : {}),
      ...(input.remindersEnabled !== undefined
        ? { remindersEnabled: input.remindersEnabled }
        : {}),
      ...(input.reminderEmails !== undefined
        ? { reminderEmails: input.reminderEmails }
        : {}),
      ...(input.digestLookaheadDays !== undefined
        ? { digestLookaheadDays: input.digestLookaheadDays }
        : {}),
      ...(input.digestHour !== undefined ? { digestHour: input.digestHour } : {}),
      ...(input.includeDeliveries !== undefined
        ? { includeDeliveries: input.includeDeliveries }
        : {}),
      ...(input.includeAnniversaries !== undefined
        ? { includeAnniversaries: input.includeAnniversaries }
        : {}),
      ...(input.includeHolidays !== undefined
        ? { includeHolidays: input.includeHolidays }
        : {}),
      ...(input.includeInvoices !== undefined
        ? { includeInvoices: input.includeInvoices }
        : {}),
    };

    await this.db
      .insert(calendarSettings)
      .values({ organizationId, ...values })
      .onConflictDoUpdate({
        target: calendarSettings.organizationId,
        set: { ...values, updatedAt: new Date() },
      });

    return this.getSettings(organizationId);
  }

  listCountries() {
    return this.holidays.listCountries();
  }

  // ── Manual events ─────────────────────────────────────────

  async getEvent(organizationId: string, id: string) {
    const [event] = await this.db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, id),
          eq(calendarEvents.organizationId, organizationId),
          isNull(calendarEvents.deletedAt),
        ),
      )
      .limit(1);

    if (!event) {
      throw new NotFoundException("Calendar event not found");
    }

    return event;
  }

  async createEvent(
    organizationId: string,
    userId: string | null,
    input: CreateCalendarEventInput,
  ) {
    const [event] = await this.db
      .insert(calendarEvents)
      .values({
        organizationId,
        title: input.title,
        description: input.description,
        category: input.category,
        startDate: input.startDate,
        endDate: input.endDate,
        startTime: input.startTime,
        endTime: input.endTime,
        customerId: input.customerId,
        vendorId: input.vendorId,
        reminderDaysBefore: input.reminderDaysBefore,
        reminderEmails: input.reminderEmails,
        createdByUserId: userId,
      })
      .returning();

    return event;
  }

  async updateEvent(
    organizationId: string,
    id: string,
    input: UpdateCalendarEventInput,
  ) {
    const existing = await this.getEvent(organizationId, id);
    const startDate = input.startDate ?? existing.startDate;
    const endDate = input.endDate !== undefined ? input.endDate : existing.endDate;

    const [event] = await this.db
      .update(calendarEvents)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        startDate,
        endDate: endDate && endDate < startDate ? null : endDate,
        ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.customerId !== undefined
          ? { customerId: input.customerId }
          : {}),
        ...(input.vendorId !== undefined ? { vendorId: input.vendorId } : {}),
        ...(input.reminderDaysBefore !== undefined
          ? { reminderDaysBefore: input.reminderDaysBefore }
          : {}),
        ...(input.reminderEmails !== undefined
          ? { reminderEmails: input.reminderEmails }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calendarEvents.id, id),
          eq(calendarEvents.organizationId, organizationId),
        ),
      )
      .returning();

    return event;
  }

  async deleteEvent(organizationId: string, id: string) {
    await this.getEvent(organizationId, id);
    await this.db
      .update(calendarEvents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(calendarEvents.id, id),
          eq(calendarEvents.organizationId, organizationId),
        ),
      );
    return { success: true };
  }

  // ── Unified calendar feed ─────────────────────────────────

  async listItems(
    organizationId: string,
    query: ListCalendarEventsQuery,
  ): Promise<CalendarItem[]> {
    const sources = new Set<CalendarSource>(
      query.sources?.length
        ? (query.sources as CalendarSource[])
        : ALL_CALENDAR_SOURCES,
    );
    const { from, to } = query;
    const today = todayIso();

    const tasks: Array<Promise<CalendarItem[]>> = [];

    if (sources.has("event")) tasks.push(this.manualEvents(organizationId, from, to));
    if (sources.has("holiday")) tasks.push(this.holidayItems(organizationId, from, to));
    if (sources.has("purchase_order"))
      tasks.push(this.purchaseOrderItems(organizationId, from, to, today));
    if (sources.has("goods_receipt"))
      tasks.push(this.goodsReceiptItems(organizationId, from, to));
    if (sources.has("invoice_due"))
      tasks.push(this.invoiceItems(organizationId, from, to, today));
    if (sources.has("quotation_expiry"))
      tasks.push(this.quotationItems(organizationId, from, to, today));
    if (sources.has("warranty_expiry"))
      tasks.push(this.warrantyItems(organizationId, from, to, today));
    if (sources.has("customer_anniversary"))
      tasks.push(this.customerAnniversaries(organizationId, from, to));
    if (sources.has("vendor_anniversary"))
      tasks.push(this.vendorAnniversaries(organizationId, from, to));

    const items = (await Promise.all(tasks)).flat();

    return items.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
        a.title.localeCompare(b.title),
    );
  }

  /** Confirmed POs whose expected date has passed and that are not fully received. */
  async overdueDeliveries(organizationId: string): Promise<CalendarItem[]> {
    const today = todayIso();
    const rows = await this.db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.number,
        expectedDate: purchaseOrders.expectedDate,
        receiptStatus: purchaseOrders.receiptStatus,
        vendorName: vendors.name,
        vendorCountry: vendors.countryCode,
      })
      .from(purchaseOrders)
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(
        and(
          eq(purchaseOrders.organizationId, organizationId),
          isNull(purchaseOrders.deletedAt),
          eq(purchaseOrders.state, "confirmed"),
          ne(purchaseOrders.receiptStatus, "received"),
          isNotNull(purchaseOrders.expectedDate),
          lt(purchaseOrders.expectedDate, today),
        ),
      )
      .orderBy(asc(purchaseOrders.expectedDate))
      .limit(100);

    return rows.map((row) => ({
      id: `po:${row.id}`,
      source: "purchase_order" as const,
      title: `Delivery overdue: ${row.number}`,
      subtitle:
        row.receiptStatus === "partial"
          ? `${row.vendorName} · partially received`
          : row.vendorName,
      date: row.expectedDate!,
      status: "overdue" as const,
      countryCode: row.vendorCountry,
      url: `/dashboard/purchasing/orders/${row.id}`,
    }));
  }

  private async manualEvents(organizationId: string, from: string, to: string) {
    const rows = await this.db
      .select({
        event: calendarEvents,
        customerName: customers.name,
        vendorName: vendors.name,
      })
      .from(calendarEvents)
      .leftJoin(customers, eq(customers.id, calendarEvents.customerId))
      .leftJoin(vendors, eq(vendors.id, calendarEvents.vendorId))
      .where(
        and(
          eq(calendarEvents.organizationId, organizationId),
          isNull(calendarEvents.deletedAt),
          lte(calendarEvents.startDate, to),
          sql`coalesce(${calendarEvents.endDate}, ${calendarEvents.startDate}) >= ${from}`,
        ),
      );

    return rows.map(({ event, customerName, vendorName }): CalendarItem => ({
      id: `event:${event.id}`,
      eventId: event.id,
      source: "event",
      title: event.title,
      subtitle: customerName ?? vendorName ?? event.description,
      date: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime,
      endTime: event.endTime,
      category: event.category,
      url: null,
    }));
  }

  private async holidayItems(organizationId: string, from: string, to: string) {
    const settings = await this.getSettings(organizationId);

    return this.holidays
      .getHolidays(settings.trackedCountries, from, to)
      .map((holiday): CalendarItem => ({
        id: `holiday:${holiday.countryCode}:${holiday.date}:${holiday.name}`,
        source: "holiday",
        title: holiday.name,
        subtitle: holiday.countryName,
        date: holiday.date,
        countryCode: holiday.countryCode,
      }));
  }

  private async purchaseOrderItems(
    organizationId: string,
    from: string,
    to: string,
    today: string,
  ) {
    const lastReceipt = sql<string | null>`(
      select max(${goodsReceipts.receiptDate})::text from ${goodsReceipts}
      where ${goodsReceipts.purchaseOrderId} = ${purchaseOrders.id}
        and ${goodsReceipts.state} = 'done'
    )`;

    const rows = await this.db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.number,
        state: purchaseOrders.state,
        receiptStatus: purchaseOrders.receiptStatus,
        expectedDate: purchaseOrders.expectedDate,
        vendorName: vendors.name,
        vendorCountry: vendors.countryCode,
        lastReceipt,
      })
      .from(purchaseOrders)
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(
        and(
          eq(purchaseOrders.organizationId, organizationId),
          isNull(purchaseOrders.deletedAt),
          ne(purchaseOrders.state, "cancelled"),
          gte(purchaseOrders.expectedDate, from),
          lte(purchaseOrders.expectedDate, to),
        ),
      );

    return rows.map((row): CalendarItem => {
      const expected = row.expectedDate!;
      let status: CalendarItemStatus;
      let label = "Expected delivery";

      if (row.state === "draft") {
        status = "draft";
      } else if (row.receiptStatus === "received") {
        const late = Boolean(row.lastReceipt && row.lastReceipt > expected);
        status = late ? "late" : "done";
        label = late ? "Delivered late" : "Delivered";
      } else {
        status = dueStatus(expected, today);
        if (status === "overdue") label = "Delivery overdue";
      }

      return {
        id: `po:${row.id}`,
        source: "purchase_order",
        title: `${label}: ${row.number}`,
        subtitle:
          row.receiptStatus === "partial"
            ? `${row.vendorName} · partially received`
            : row.vendorName,
        date: expected,
        status,
        countryCode: row.vendorCountry,
        url: `/dashboard/purchasing/orders/${row.id}`,
      };
    });
  }

  private async goodsReceiptItems(
    organizationId: string,
    from: string,
    to: string,
  ) {
    const rows = await this.db
      .select({
        id: goodsReceipts.id,
        number: goodsReceipts.number,
        receiptDate: goodsReceipts.receiptDate,
        purchaseOrderId: purchaseOrders.id,
        purchaseOrderNumber: purchaseOrders.number,
        vendorName: vendors.name,
      })
      .from(goodsReceipts)
      .innerJoin(
        purchaseOrders,
        eq(purchaseOrders.id, goodsReceipts.purchaseOrderId),
      )
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(
        and(
          eq(goodsReceipts.organizationId, organizationId),
          eq(goodsReceipts.state, "done"),
          gte(goodsReceipts.receiptDate, from),
          lte(goodsReceipts.receiptDate, to),
        ),
      );

    return rows.map((row): CalendarItem => ({
      id: `receipt:${row.id}`,
      source: "goods_receipt",
      title: `Goods received: ${row.number}`,
      subtitle: `${row.purchaseOrderNumber} · ${row.vendorName}`,
      date: row.receiptDate,
      status: "done",
      url: `/dashboard/purchasing/orders/${row.purchaseOrderId}`,
    }));
  }

  private async invoiceItems(
    organizationId: string,
    from: string,
    to: string,
    today: string,
  ) {
    const rows = await this.db
      .select({
        id: invoices.id,
        number: invoices.number,
        dueDate: invoices.dueDate,
        paymentState: invoices.paymentState,
        customerName: customers.name,
      })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.state, "posted"),
          isNull(invoices.deletedAt),
          gte(invoices.dueDate, from),
          lte(invoices.dueDate, to),
        ),
      );

    return rows.map((row): CalendarItem => {
      const status =
        row.paymentState === "paid" ? "paid" : dueStatus(row.dueDate!, today);
      return {
        id: `invoice:${row.id}`,
        source: "invoice_due",
        title: `${status === "overdue" ? "Invoice overdue" : "Invoice due"}: ${row.number}`,
        subtitle: row.customerName,
        date: row.dueDate!,
        status,
        url: `/dashboard/invoices/${row.id}`,
      };
    });
  }

  private async quotationItems(
    organizationId: string,
    from: string,
    to: string,
    today: string,
  ) {
    const rows = await this.db
      .select({
        id: salesOrders.id,
        number: salesOrders.number,
        validityDate: salesOrders.validityDate,
        customerName: customers.name,
      })
      .from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(
        and(
          eq(salesOrders.organizationId, organizationId),
          isNull(salesOrders.deletedAt),
          inArray(salesOrders.state, ["draft", "sent"]),
          gte(salesOrders.validityDate, from),
          lte(salesOrders.validityDate, to),
        ),
      );

    return rows.map((row): CalendarItem => {
      const status = dueStatus(row.validityDate!, today);
      return {
        id: `quotation:${row.id}`,
        source: "quotation_expiry",
        title: `${status === "overdue" ? "Quotation expired" : "Quotation expires"}: ${row.number}`,
        subtitle: row.customerName,
        date: row.validityDate!,
        status,
        url: `/dashboard/sales/quotations/${row.id}`,
      };
    });
  }

  private async warrantyItems(
    organizationId: string,
    from: string,
    to: string,
    today: string,
  ) {
    const rows = await this.db
      .select({
        id: warrantyRegistrations.id,
        endsAt: warrantyRegistrations.endsAt,
        productName: warrantyRegistrations.productName,
        serialNumber: warrantyRegistrations.serialNumber,
        customerName: customers.name,
      })
      .from(warrantyRegistrations)
      .leftJoin(customers, eq(customers.id, warrantyRegistrations.customerId))
      .where(
        and(
          eq(warrantyRegistrations.organizationId, organizationId),
          inArray(warrantyRegistrations.status, ["active", "expired"]),
          gte(warrantyRegistrations.endsAt, from),
          lte(warrantyRegistrations.endsAt, to),
        ),
      );

    return rows.map((row): CalendarItem => {
      const status = dueStatus(row.endsAt!, today);
      const product = row.productName ?? "Product";
      return {
        id: `warranty:${row.id}`,
        source: "warranty_expiry",
        title: `Warranty ${status === "overdue" ? "expired" : "expires"}: ${product}`,
        subtitle: [row.customerName, row.serialNumber].filter(Boolean).join(" · ") || null,
        date: row.endsAt!,
        status,
        url: `/dashboard/warranty/${row.id}`,
      };
    });
  }

  private async customerAnniversaries(
    organizationId: string,
    from: string,
    to: string,
  ) {
    const rows = await this.db
      .select({
        id: customers.id,
        name: customers.name,
        memberSince: customers.memberSince,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(
        and(
          eq(customers.organizationId, organizationId),
          isNull(customers.deletedAt),
          eq(customers.isActive, true),
        ),
      );

    return rows.flatMap((row) =>
      anniversariesInRange(
        row.memberSince ?? row.createdAt.toISOString().slice(0, 10),
        from,
        to,
      ).map(({ date, years }): CalendarItem => ({
        id: `customer-anniversary:${row.id}:${date}`,
        source: "customer_anniversary",
        title: `${row.name} — ${ordinal(years)} anniversary`,
        subtitle: `Customer for ${years} year${years === 1 ? "" : "s"}`,
        date,
        url: `/dashboard/customers/${row.id}`,
      })),
    );
  }

  private async vendorAnniversaries(
    organizationId: string,
    from: string,
    to: string,
  ) {
    const rows = await this.db
      .select({
        id: vendors.id,
        name: vendors.name,
        memberSince: vendors.memberSince,
        createdAt: vendors.createdAt,
      })
      .from(vendors)
      .where(
        and(
          eq(vendors.organizationId, organizationId),
          isNull(vendors.deletedAt),
          eq(vendors.isActive, true),
        ),
      );

    return rows.flatMap((row) =>
      anniversariesInRange(
        row.memberSince ?? row.createdAt.toISOString().slice(0, 10),
        from,
        to,
      ).map(({ date, years }): CalendarItem => ({
        id: `vendor-anniversary:${row.id}:${date}`,
        source: "vendor_anniversary",
        title: `${row.name} — ${ordinal(years)} anniversary`,
        subtitle: `Vendor for ${years} year${years === 1 ? "" : "s"}`,
        date,
        url: `/dashboard/purchasing/vendors/${row.id}`,
      })),
    );
  }
}
