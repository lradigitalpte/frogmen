import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  customers,
  deliveryNoteLines,
  deliveryNotes,
  invoiceLines,
  invoices,
  productUnits,
  products,
  type Database,
} from "@frog1/db";
import { formatPostalAddressLines } from "@frog1/shared";
import { DATABASE } from "../database/database.constants";
import { SettingsService } from "../settings/settings.service";
import { nextDocumentNumber } from "../sales/document-sequences";

export interface ApproveDeliveryNoteInput {
  deliveryDate?: string;
}

@Injectable()
export class DeliveryNotesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly settingsService: SettingsService,
  ) {}

  async preview(organizationId: string, invoiceId: string) {
    const context = await this.loadInvoiceContext(organizationId, invoiceId);
    const existing = await this.findActiveByInvoice(organizationId, invoiceId);

    if (existing) {
      return this.getById(organizationId, existing.id);
    }

    const branding = await this.settingsService.getOrganizationBranding(
      organizationId,
    );
    const profile = branding.companyProfile;

    return {
      id: null,
      state: "draft" as const,
      number: null,
      invoiceId: context.invoice.id,
      invoiceNumber: context.invoice.number,
      customerId: context.invoice.customerId,
      customerName: context.customerName,
      customerEmail: context.customerEmail,
      deliveryDate: new Date().toISOString().slice(0, 10),
      deliveryStreet1: context.customer.street1,
      deliveryStreet2: context.customer.street2,
      deliveryCity: context.customer.city,
      deliveryZip: context.customer.zip,
      deliveryStateCode: context.customer.stateCode,
      deliveryCountryCode: context.customer.countryCode,
      deliveryAddress: formatPostalAddressLines({
        street1: context.customer.street1,
        street2: context.customer.street2,
        city: context.customer.city,
        stateCode: context.customer.stateCode,
        zip: context.customer.zip,
        countryCode: context.customer.countryCode,
      }),
      receivedBy: null,
      signatureImage: null,
      signedOn: null,
      companyName: branding.name,
      companyLogoUrl: branding.logoUrl,
      companyAddress: [
        profile.address,
        [profile.city, profile.country].filter(Boolean).join(", "),
        profile.phone ? `Phone: ${profile.phone}` : null,
        profile.email ? `Email: ${profile.email}` : null,
      ].filter((line): line is string => Boolean(line)),
      lines: context.lines.map((row, index) => ({
        id: null,
        lineNumber: index + 1,
        invoiceLineId: row.line.id,
        description: row.line.description,
        productDescription: row.productDescription ?? null,
        serialNumber: row.serialNumber ?? null,
        quantity: Number(row.line.quantity),
        productId: row.line.productId,
        productUnitId: row.line.productUnitId,
      })),
    };
  }

  async approve(
    organizationId: string,
    invoiceId: string,
    input: ApproveDeliveryNoteInput,
  ) {
    const existing = await this.findActiveByInvoice(organizationId, invoiceId);
    if (existing) {
      return this.getById(organizationId, existing.id);
    }

    const context = await this.loadInvoiceContext(organizationId, invoiceId);

    if (context.invoice.state !== "posted") {
      throw new BadRequestException(
        "Only posted invoices can have delivery notes",
      );
    }

    const number = await nextDocumentNumber(
      this.db,
      organizationId,
      "delivery_note",
      "DEL-",
    );

    const deliveryDate =
      input.deliveryDate?.trim() || new Date().toISOString().slice(0, 10);

    const [note] = await this.db
      .insert(deliveryNotes)
      .values({
        organizationId,
        invoiceId: context.invoice.id,
        customerId: context.invoice.customerId,
        number,
        deliveryDate,
        state: "approved",
        deliveryStreet1: context.customer.street1,
        deliveryStreet2: context.customer.street2,
        deliveryCity: context.customer.city,
        deliveryZip: context.customer.zip,
        deliveryStateCode: context.customer.stateCode,
        deliveryCountryCode: context.customer.countryCode,
        receivedBy: null,
        signatureImage: null,
        signedOn: null,
      })
      .returning();

    await this.db.insert(deliveryNoteLines).values(
      context.lines.map((row, index) => ({
        deliveryNoteId: note.id,
        invoiceLineId: row.line.id,
        lineNumber: index + 1,
        productId: row.line.productId,
        productUnitId: row.line.productUnitId,
        description: row.line.description,
        serialNumber: row.serialNumber ?? null,
        quantity: row.line.quantity,
      })),
    );

    return this.getById(organizationId, note.id);
  }

  async listByInvoice(organizationId: string, invoiceId: string) {
    const rows = await this.db
      .select()
      .from(deliveryNotes)
      .where(
        and(
          eq(deliveryNotes.organizationId, organizationId),
          eq(deliveryNotes.invoiceId, invoiceId),
          isNull(deliveryNotes.deletedAt),
        ),
      )
      .orderBy(desc(deliveryNotes.createdAt));

    return rows.map((row) => this.mapSummary(row));
  }

  async getById(organizationId: string, id: string) {
    const [header] = await this.db
      .select({
        note: deliveryNotes,
        customerName: customers.name,
        customerEmail: customers.email,
        invoiceNumber: invoices.number,
      })
      .from(deliveryNotes)
      .innerJoin(customers, eq(customers.id, deliveryNotes.customerId))
      .innerJoin(invoices, eq(invoices.id, deliveryNotes.invoiceId))
      .where(
        and(
          eq(deliveryNotes.id, id),
          eq(deliveryNotes.organizationId, organizationId),
          isNull(deliveryNotes.deletedAt),
        ),
      )
      .limit(1);

    if (!header) {
      throw new NotFoundException("Delivery note not found");
    }

    const lines = await this.db
      .select({
        line: deliveryNoteLines,
        productDescription: products.description,
      })
      .from(deliveryNoteLines)
      .leftJoin(products, eq(products.id, deliveryNoteLines.productId))
      .where(eq(deliveryNoteLines.deliveryNoteId, id))
      .orderBy(asc(deliveryNoteLines.lineNumber));

    const branding = await this.settingsService.getOrganizationBranding(
      organizationId,
    );
    const profile = branding.companyProfile;

    return {
      id: header.note.id,
      state: header.note.state,
      number: header.note.number,
      invoiceId: header.note.invoiceId,
      invoiceNumber: header.invoiceNumber,
      customerId: header.note.customerId,
      customerName: header.customerName,
      customerEmail: header.customerEmail,
      deliveryDate: header.note.deliveryDate,
      deliveryStreet1: header.note.deliveryStreet1,
      deliveryStreet2: header.note.deliveryStreet2,
      deliveryCity: header.note.deliveryCity,
      deliveryZip: header.note.deliveryZip,
      deliveryStateCode: header.note.deliveryStateCode,
      deliveryCountryCode: header.note.deliveryCountryCode,
      deliveryAddress: formatPostalAddressLines({
        street1: header.note.deliveryStreet1,
        street2: header.note.deliveryStreet2,
        city: header.note.deliveryCity,
        stateCode: header.note.deliveryStateCode,
        zip: header.note.deliveryZip,
        countryCode: header.note.deliveryCountryCode,
      }),
      receivedBy: header.note.receivedBy,
      signatureImage: header.note.signatureImage,
      signedOn: header.note.signedOn?.toISOString() ?? null,
      companyName: branding.name,
      companyLogoUrl: branding.logoUrl,
      companyAddress: [
        profile.address,
        [profile.city, profile.country].filter(Boolean).join(", "),
        profile.phone ? `Phone: ${profile.phone}` : null,
        profile.email ? `Email: ${profile.email}` : null,
      ].filter((line): line is string => Boolean(line)),
      lines: lines.map((row) => ({
        id: row.line.id,
        lineNumber: row.line.lineNumber,
        invoiceLineId: row.line.invoiceLineId,
        description: row.line.description,
        productDescription: row.productDescription ?? null,
        serialNumber: row.line.serialNumber ?? null,
        quantity: Number(row.line.quantity),
        productId: row.line.productId,
        productUnitId: row.line.productUnitId,
      })),
      createdAt: header.note.createdAt.toISOString(),
    };
  }

  private async findActiveByInvoice(
    organizationId: string,
    invoiceId: string,
  ) {
    const [row] = await this.db
      .select({ id: deliveryNotes.id })
      .from(deliveryNotes)
      .where(
        and(
          eq(deliveryNotes.organizationId, organizationId),
          eq(deliveryNotes.invoiceId, invoiceId),
          isNull(deliveryNotes.deletedAt),
        ),
      )
      .orderBy(desc(deliveryNotes.createdAt))
      .limit(1);

    return row ?? null;
  }

  private async loadInvoiceContext(organizationId: string, invoiceId: string) {
    const [header] = await this.db
      .select({
        invoice: invoices,
        customerName: customers.name,
        customerEmail: customers.email,
        customer: customers,
      })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.organizationId, organizationId),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);

    if (!header) {
      throw new NotFoundException("Invoice not found");
    }

    const lines = await this.db
      .select({
        line: invoiceLines,
        serialNumber: productUnits.serialNumber,
        productDescription: products.description,
      })
      .from(invoiceLines)
      .leftJoin(productUnits, eq(productUnits.id, invoiceLines.productUnitId))
      .leftJoin(products, eq(products.id, invoiceLines.productId))
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.lineNumber));

    if (lines.length === 0) {
      throw new BadRequestException("Invoice has no lines for delivery note");
    }

    return {
      ...header,
      lines,
    };
  }

  private mapSummary(row: typeof deliveryNotes.$inferSelect) {
    return {
      id: row.id,
      number: row.number,
      invoiceId: row.invoiceId,
      deliveryDate: row.deliveryDate,
      state: row.state,
      receivedBy: row.receivedBy ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
