import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  customers,
  invoiceLines,
  invoices,
  productUnits,
  products,
  salesOrderLines,
  warrantyPolicies,
  warrantyRegistrations,
  type Database,
} from "@frog1/db";
import type {
  CreateWarrantyDto,
  ListWarrantiesQuery,
  SearchSalesQuery,
} from "./dto/warranty.dto";
import { WarrantyPoliciesService } from "./warranty-policies.service";
import {
  addMonthsToDate,
  computeDaysLeft,
  formatDateOnly,
  resolveWarrantyStatus,
} from "./warranty.utils";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class WarrantiesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly warrantyPoliciesService: WarrantyPoliciesService,
  ) {}

  private enrichRegistration(
    row: typeof warrantyRegistrations.$inferSelect & {
      policyName?: string | null;
      policyDurationMonths?: number | null;
      customerDisplayName?: string | null;
      productDisplayName?: string | null;
      invoiceNumber?: string | null;
    },
  ) {
    const status = resolveWarrantyStatus(row.endsAt, row.status);
    const daysLeft = computeDaysLeft(row.endsAt);

    return {
      ...row,
      status,
      daysLeft,
      displayProductName:
        row.productDisplayName ?? row.productName ?? "Unknown product",
      displayCustomerName:
        row.customerDisplayName ?? row.customerName ?? "Unknown customer",
      policy: row.policyName
        ? {
            id: row.policyId,
            name: row.policyName,
            durationMonths: row.policyDurationMonths ?? 0,
          }
        : undefined,
      invoiceNumber: row.invoiceNumber ?? null,
    };
  }

  async list(organizationId: string, query: ListWarrantiesQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 50, 1), 200);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(warrantyRegistrations.organizationId, organizationId),
    ];

    if (query.productId) {
      filters.push(eq(warrantyRegistrations.productId, query.productId));
    }

    if (query.productUnitId) {
      filters.push(eq(warrantyRegistrations.productUnitId, query.productUnitId));
    }

    if (query.status && query.status !== "expired") {
      filters.push(eq(warrantyRegistrations.status, query.status));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(warrantyRegistrations.productName, term),
          ilike(warrantyRegistrations.serialNumber, term),
          ilike(warrantyRegistrations.customerName, term),
          ilike(products.name, term),
          ilike(customers.name, term),
          ilike(warrantyPolicies.name, term),
        )!,
      );
    }

    const whereClause = and(...filters);

    const rows = await this.db
      .select({
        registration: warrantyRegistrations,
        policyName: warrantyPolicies.name,
        policyDurationMonths: warrantyPolicies.durationMonths,
        customerDisplayName: customers.name,
        productDisplayName: products.name,
        invoiceNumber: invoices.number,
      })
      .from(warrantyRegistrations)
      .leftJoin(
        warrantyPolicies,
        eq(warrantyRegistrations.policyId, warrantyPolicies.id),
      )
      .leftJoin(customers, eq(warrantyRegistrations.customerId, customers.id))
      .leftJoin(products, eq(warrantyRegistrations.productId, products.id))
      .leftJoin(invoices, eq(warrantyRegistrations.invoiceId, invoices.id))
      .where(whereClause)
      .orderBy(desc(warrantyRegistrations.endsAt))
      .limit(perPage)
      .offset(offset);

    let data = rows.map((row) =>
      this.enrichRegistration({
        ...row.registration,
        policyName: row.policyName,
        policyDurationMonths: row.policyDurationMonths,
        customerDisplayName: row.customerDisplayName,
        productDisplayName: row.productDisplayName,
        invoiceNumber: row.invoiceNumber,
      }),
    );

    if (query.status === "expired") {
      data = data.filter((item) => item.status === "expired");
    } else if (query.status === "active") {
      data = data.filter((item) => item.status === "active");
    }

    if (query.expiringSoon) {
      data = data.filter(
        (item) => item.status === "active" && item.daysLeft >= 0 && item.daysLeft <= 30,
      );
    }

    const [totalResult] = await this.db
      .select({ total: count() })
      .from(warrantyRegistrations)
      .where(whereClause);

    return {
      data,
      meta: {
        page,
        perPage,
        total: Number(totalResult?.total ?? 0),
        totalPages: Math.ceil(Number(totalResult?.total ?? 0) / perPage) || 1,
      },
    };
  }

  async getById(organizationId: string, id: string) {
    const [row] = await this.db
      .select({
        registration: warrantyRegistrations,
        policyName: warrantyPolicies.name,
        policyDurationMonths: warrantyPolicies.durationMonths,
        policyDescription: warrantyPolicies.description,
        customerDisplayName: customers.name,
        productDisplayName: products.name,
        productSku: products.sku,
        invoiceNumber: invoices.number,
        unitSerial: productUnits.serialNumber,
      })
      .from(warrantyRegistrations)
      .leftJoin(
        warrantyPolicies,
        eq(warrantyRegistrations.policyId, warrantyPolicies.id),
      )
      .leftJoin(customers, eq(warrantyRegistrations.customerId, customers.id))
      .leftJoin(products, eq(warrantyRegistrations.productId, products.id))
      .leftJoin(invoices, eq(warrantyRegistrations.invoiceId, invoices.id))
      .leftJoin(
        productUnits,
        eq(warrantyRegistrations.productUnitId, productUnits.id),
      )
      .where(
        and(
          eq(warrantyRegistrations.id, id),
          eq(warrantyRegistrations.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException("Warranty registration not found");
    }

    const enriched = this.enrichRegistration({
      ...row.registration,
      policyName: row.policyName,
      policyDurationMonths: row.policyDurationMonths,
      customerDisplayName: row.customerDisplayName,
      productDisplayName: row.productDisplayName,
      invoiceNumber: row.invoiceNumber,
    });

    return {
      ...enriched,
      serialNumber: enriched.serialNumber ?? row.unitSerial ?? null,
      policyDescription: row.policyDescription,
      productSku: row.productSku,
    };
  }

  async createManual(organizationId: string, dto: CreateWarrantyDto) {
    const policy = await this.warrantyPoliciesService.getById(
      organizationId,
      dto.policyId,
    );

    if (!dto.soldAt?.trim()) {
      throw new BadRequestException("Sold date is required");
    }

    const soldAt = dto.soldAt.slice(0, 10);
    const startsAt = soldAt;
    const endsAt =
      dto.endsAt?.slice(0, 10) ??
      addMonthsToDate(soldAt, policy.durationMonths);

    if (dto.invoiceLineId) {
      return this.createFromInvoiceLine(
        organizationId,
        dto.invoiceLineId,
        dto.policyId,
        { soldAt, endsAt, notes: dto.notes },
      );
    }

    const hasProduct = Boolean(dto.productId || dto.productName?.trim());
    if (!hasProduct) {
      throw new BadRequestException("Product name or catalog product is required");
    }

    const hasCustomer = Boolean(dto.customerId || dto.customerName?.trim());
    if (!hasCustomer) {
      throw new BadRequestException("Customer or sold-to name is required");
    }

    if (dto.customerId) {
      const [customer] = await this.db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.id, dto.customerId),
            eq(customers.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!customer) {
        throw new NotFoundException("Customer not found");
      }
    }

    let productName = dto.productName?.trim() || null;
    let productId = dto.productId ?? null;
    let serialNumber = dto.serialNumber?.trim() || null;
    let productUnitId = dto.productUnitId ?? null;

    if (dto.productId) {
      const [product] = await this.db
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, dto.productId),
            eq(products.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!product) {
        throw new NotFoundException("Product not found");
      }

      productName = product.name;

      if (dto.productUnitId) {
        const [unit] = await this.db
          .select()
          .from(productUnits)
          .where(
            and(
              eq(productUnits.id, dto.productUnitId),
              eq(productUnits.organizationId, organizationId),
              eq(productUnits.productId, dto.productId),
            ),
          )
          .limit(1);

        if (!unit) {
          throw new NotFoundException("Serial unit not found");
        }

        serialNumber = unit.serialNumber;
        productUnitId = unit.id;
      }
    }

    if (productUnitId) {
      await this.assertSerialNotAlreadyRegistered(organizationId, productUnitId);
    }

    const [created] = await this.db
      .insert(warrantyRegistrations)
      .values({
        organizationId,
        policyId: dto.policyId,
        source: "manual",
        status: resolveWarrantyStatus(endsAt, "active"),
        startsAt,
        endsAt,
        soldAt,
        productId,
        productUnitId,
        serialNumber,
        productName,
        customerId: dto.customerId ?? null,
        customerName: dto.customerName?.trim() || null,
        quantity: dto.quantity ?? 1,
        notes: dto.notes?.trim() || null,
      })
      .returning();

    return this.getById(organizationId, created.id);
  }

  private async createFromInvoiceLine(
    organizationId: string,
    invoiceLineId: string,
    policyId: string,
    options?: { soldAt?: string; endsAt?: string; notes?: string },
  ) {
    const [line] = await this.db
      .select({
        line: invoiceLines,
        invoice: invoices,
        product: products,
        unit: productUnits,
        salesLine: salesOrderLines,
        customer: customers,
      })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
      .leftJoin(products, eq(invoiceLines.productId, products.id))
      .leftJoin(productUnits, eq(invoiceLines.productUnitId, productUnits.id))
      .leftJoin(
        salesOrderLines,
        eq(invoiceLines.salesOrderLineId, salesOrderLines.id),
      )
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(
        and(
          eq(invoiceLines.id, invoiceLineId),
          eq(invoices.organizationId, organizationId),
          eq(invoices.state, "posted"),
        ),
      )
      .limit(1);

    if (!line) {
      throw new NotFoundException("Posted invoice line not found");
    }

    const [existingOnLine] = await this.db
      .select({ id: warrantyRegistrations.id })
      .from(warrantyRegistrations)
      .where(
        and(
          eq(warrantyRegistrations.organizationId, organizationId),
          eq(warrantyRegistrations.invoiceLineId, invoiceLineId),
        ),
      )
      .limit(1);

    if (existingOnLine) {
      return this.getById(organizationId, existingOnLine.id);
    }

    if (line.line.productUnitId) {
      await this.assertSerialNotAlreadyRegistered(
        organizationId,
        line.line.productUnitId,
      );
    }

    const policy = await this.warrantyPoliciesService.getById(
      organizationId,
      policyId,
    );

    const soldAt =
      options?.soldAt ??
      formatDateOnly(line.invoice.postedAt ?? line.invoice.invoiceDate);
    const startsAt = soldAt;
    const endsAt =
      options?.endsAt ?? addMonthsToDate(soldAt, policy.durationMonths);

    const [created] = await this.db
      .insert(warrantyRegistrations)
      .values({
        organizationId,
        policyId,
        source: "manual",
        status: resolveWarrantyStatus(endsAt, "active"),
        startsAt,
        endsAt,
        soldAt,
        productId: line.line.productId,
        productUnitId: line.line.productUnitId,
        serialNumber: line.unit?.serialNumber ?? null,
        productName: line.product?.name ?? line.line.description,
        customerId: line.invoice.customerId,
        customerName: line.customer?.name ?? null,
        quantity: Number(line.line.quantity) || 1,
        invoiceId: line.invoice.id,
        invoiceLineId: line.line.id,
        salesOrderLineId: line.line.salesOrderLineId,
        notes: options?.notes?.trim() || null,
      })
      .returning();

    return this.getById(organizationId, created.id);
  }

  async searchSales(organizationId: string, query: SearchSalesQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 25, 1), 100);
    const offset = (page - 1) * perPage;

    const lineAlreadyRegistered = notExists(
      this.db
        .select({ id: warrantyRegistrations.id })
        .from(warrantyRegistrations)
        .where(
          and(
            eq(warrantyRegistrations.organizationId, organizationId),
            eq(warrantyRegistrations.invoiceLineId, invoiceLines.id),
          ),
        ),
    );

    const serialAlreadyRegistered = or(
      isNull(invoiceLines.productUnitId),
      notExists(
        this.db
          .select({ id: warrantyRegistrations.id })
          .from(warrantyRegistrations)
          .where(
            and(
              eq(warrantyRegistrations.organizationId, organizationId),
              eq(
                warrantyRegistrations.productUnitId,
                invoiceLines.productUnitId,
              ),
              ne(warrantyRegistrations.status, "voided"),
            ),
          ),
      ),
    );

    const filters: SQL[] = [
      eq(invoices.organizationId, organizationId),
      eq(invoices.state, "posted"),
      isNotNull(invoiceLines.productId),
      lineAlreadyRegistered,
      serialAlreadyRegistered!,
    ];

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(invoices.number, term),
          ilike(customers.name, term),
          ilike(products.name, term),
          ilike(productUnits.serialNumber, term),
          ilike(invoiceLines.description, term),
        )!,
      );
    }

    const whereClause = and(...filters);

    const rows = await this.db
      .select({
        invoiceLineId: invoiceLines.id,
        invoiceId: invoices.id,
        invoiceNumber: invoices.number,
        invoiceDate: invoices.invoiceDate,
        postedAt: invoices.postedAt,
        customerId: customers.id,
        customerName: customers.name,
        productId: products.id,
        productName: products.name,
        productUnitId: productUnits.id,
        serialNumber: productUnits.serialNumber,
        quantity: invoiceLines.quantity,
        defaultWarrantyPolicyId: products.defaultWarrantyPolicyId,
        lineWarrantyPolicyId: salesOrderLines.warrantyPolicyId,
      })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(products, eq(invoiceLines.productId, products.id))
      .leftJoin(productUnits, eq(invoiceLines.productUnitId, productUnits.id))
      .leftJoin(
        salesOrderLines,
        eq(invoiceLines.salesOrderLineId, salesOrderLines.id),
      )
      .where(whereClause)
      .orderBy(desc(invoices.postedAt), desc(invoiceLines.lineNumber))
      .limit(perPage * 3)
      .offset(offset);

    const seenUnitIds = new Set<string>();
    const dedupedRows = rows.filter((row) => {
      if (!row.productUnitId) {
        return true;
      }

      if (seenUnitIds.has(row.productUnitId)) {
        return false;
      }

      seenUnitIds.add(row.productUnitId);
      return true;
    });

    const data = dedupedRows.slice(0, perPage).map((row) => ({
      ...row,
      soldAt: formatDateOnly(row.postedAt ?? row.invoiceDate),
      resolvedPolicyId:
        row.lineWarrantyPolicyId ?? row.defaultWarrantyPolicyId ?? null,
    }));

    return {
      data,
      meta: {
        page,
        perPage,
        total: data.length,
        totalPages: 1,
      },
    };
  }

  async registerFromInvoicePost(organizationId: string, invoiceId: string) {
    const [invoice] = await this.db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!invoice) {
      return;
    }

    const soldAt = formatDateOnly(invoice.postedAt ?? invoice.invoiceDate);

    const lines = await this.db
      .select({
        line: invoiceLines,
        product: products,
        unit: productUnits,
        salesLine: salesOrderLines,
        customer: customers,
      })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
      .leftJoin(products, eq(invoiceLines.productId, products.id))
      .leftJoin(productUnits, eq(invoiceLines.productUnitId, productUnits.id))
      .leftJoin(
        salesOrderLines,
        eq(invoiceLines.salesOrderLineId, salesOrderLines.id),
      )
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(eq(invoiceLines.invoiceId, invoiceId));

    for (const row of lines) {
      if (!row.line.productId || !row.product) {
        continue;
      }

      if (row.product.type === "service" && !row.salesLine?.warrantyPolicyId) {
        continue;
      }

      const policyId =
        row.salesLine?.warrantyPolicyId ?? row.product.defaultWarrantyPolicyId;

      if (!policyId) {
        continue;
      }

      const [existing] = await this.db
        .select({ id: warrantyRegistrations.id })
        .from(warrantyRegistrations)
        .where(
          and(
            eq(warrantyRegistrations.organizationId, organizationId),
            eq(warrantyRegistrations.invoiceLineId, row.line.id),
            row.line.productUnitId
              ? eq(warrantyRegistrations.productUnitId, row.line.productUnitId)
              : sql`true`,
          ),
        )
        .limit(1);

      if (existing) {
        continue;
      }

      const policy = await this.warrantyPoliciesService.getById(
        organizationId,
        policyId,
      );

      const endsAt = addMonthsToDate(soldAt, policy.durationMonths);

      await this.db.insert(warrantyRegistrations).values({
        organizationId,
        policyId,
        source: "sale",
        status: "active",
        startsAt: soldAt,
        endsAt,
        soldAt,
        productId: row.line.productId,
        productUnitId: row.line.productUnitId,
        serialNumber: row.unit?.serialNumber ?? null,
        productName: row.product.name,
        customerId: invoice.customerId,
        customerName: row.customer?.name ?? null,
        quantity: Number(row.line.quantity) || 1,
        invoiceId: invoice.id,
        invoiceLineId: row.line.id,
        salesOrderLineId: row.line.salesOrderLineId,
      });
    }
  }

  private async assertSerialNotAlreadyRegistered(
    organizationId: string,
    productUnitId: string,
  ) {
    const [existing] = await this.db
      .select({ id: warrantyRegistrations.id })
      .from(warrantyRegistrations)
      .where(
        and(
          eq(warrantyRegistrations.organizationId, organizationId),
          eq(warrantyRegistrations.productUnitId, productUnitId),
          ne(warrantyRegistrations.status, "voided"),
        ),
      )
      .limit(1);

    if (existing) {
      throw new BadRequestException(
        "Warranty is already registered for this serial number",
      );
    }
  }
}
