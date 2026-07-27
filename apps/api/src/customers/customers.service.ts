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
  currencies,
  customers,
  invoicePayments,
  invoices,
  salesOrders,
  type Database,
} from "@frog1/db";
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "./dto/customer.dto";
import { UploadsService } from "../uploads/uploads.service";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class CustomersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly uploadsService: UploadsService,
  ) {}

  async list(organizationId: string, query: ListCustomersQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 16, 1), 100);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [eq(customers.organizationId, organizationId)];

    if (query.archived) {
      filters.push(isNotNull(customers.deletedAt));
    } else {
      filters.push(isNull(customers.deletedAt));
    }

    if (query.accountType) {
      filters.push(eq(customers.accountType, query.accountType));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(customers.name, term),
          ilike(customers.email, term),
          ilike(customers.phone, term),
          ilike(customers.mobile, term),
        )!,
      );
    }

    const whereClause = and(...filters);

    const sortColumn =
      query.sortBy === "email"
        ? customers.email
        : query.sortBy === "createdAt"
          ? customers.createdAt
          : customers.name;

    const orderBy =
      query.sortDir === "desc" ? desc(sortColumn) : asc(sortColumn);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(customers)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(perPage)
        .offset(offset),
      this.db.select({ total: count() }).from(customers).where(whereClause),
    ]);

    const total = Number(totalResult[0]?.total ?? 0);

    return {
      data: rows,
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage) || 1,
      },
    };
  }

  async getStats(organizationId: string) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthStartIso = monthStart.toISOString();

    const activeFilter = and(
      eq(customers.organizationId, organizationId),
      isNull(customers.deletedAt),
    );

    const [counts] = await this.db
      .select({
        totalAccounts: count(),
        corporateAccounts: sql<number>`count(*) filter (where ${customers.accountType} = 'company')`,
        registeredThisMonth: sql<number>`count(*) filter (where ${customers.createdAt} >= ${monthStartIso})`,
      })
      .from(customers)
      .where(activeFilter);

    const [credit] = await this.db
      .select({
        totalCreditLine: sum(customers.creditLimit),
        approvedAccounts: sql<number>`count(*) filter (where ${customers.creditApproved} = true)`,
      })
      .from(customers)
      .where(
        and(activeFilter, eq(customers.creditApproved, true)),
      );

    return {
      totalAccounts: Number(counts?.totalAccounts ?? 0),
      corporateAccounts: Number(counts?.corporateAccounts ?? 0),
      registeredThisMonth: Number(counts?.registeredThisMonth ?? 0),
      totalCreditLine: String(credit?.totalCreditLine ?? "0"),
      approvedCreditAccounts: Number(credit?.approvedAccounts ?? 0),
    };
  }

  async getById(organizationId: string, id: string) {
    const [customer] = await this.db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, id),
          eq(customers.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return customer;
  }

  async getActivity(organizationId: string, customerId: string) {
    await this.getById(organizationId, customerId);

    const [orders, invoiceRows, payments] = await Promise.all([
      this.db
        .select({
          id: salesOrders.id,
          number: salesOrders.number,
          state: salesOrders.state,
          date: salesOrders.quoteDate,
          amount: salesOrders.amountTotal,
          currencyCode: currencies.code,
        })
        .from(salesOrders)
        .innerJoin(currencies, eq(currencies.id, salesOrders.currencyId))
        .where(
          and(
            eq(salesOrders.organizationId, organizationId),
            eq(salesOrders.customerId, customerId),
            isNull(salesOrders.deletedAt),
          ),
        )
        .orderBy(desc(salesOrders.createdAt))
        .limit(3),
      this.db
        .select({
          id: invoices.id,
          number: invoices.number,
          state: invoices.state,
          paymentState: invoices.paymentState,
          date: invoices.invoiceDate,
          amount: invoices.amountTotal,
          currencyCode: currencies.code,
        })
        .from(invoices)
        .innerJoin(currencies, eq(currencies.id, invoices.currencyId))
        .where(
          and(
            eq(invoices.organizationId, organizationId),
            eq(invoices.customerId, customerId),
            isNull(invoices.deletedAt),
          ),
        )
        .orderBy(desc(invoices.createdAt))
        .limit(3),
      this.db
        .select({
          id: invoicePayments.id,
          invoiceId: invoices.id,
          invoiceNumber: invoices.number,
          date: invoicePayments.paymentDate,
          amount: invoicePayments.amount,
          method: invoicePayments.method,
          currencyCode: currencies.code,
        })
        .from(invoicePayments)
        .innerJoin(invoices, eq(invoices.id, invoicePayments.invoiceId))
        .innerJoin(currencies, eq(currencies.id, invoicePayments.currencyId))
        .where(
          and(
            eq(invoicePayments.organizationId, organizationId),
            eq(invoices.customerId, customerId),
          ),
        )
        .orderBy(desc(invoicePayments.createdAt))
        .limit(3),
    ]);

    return {
      quotations: orders.map((row) => ({ ...row, amount: Number(row.amount) })),
      invoices: invoiceRows.map((row) => ({ ...row, amount: Number(row.amount) })),
      payments: payments.map((row) => ({ ...row, amount: Number(row.amount) })),
    };
  }

  async create(organizationId: string, dto: CreateCustomerInput) {
    if (dto.parentId) {
      await this.getById(organizationId, dto.parentId);
    }

    const [customer] = await this.db
      .insert(customers)
      .values({
        organizationId,
        accountType: dto.accountType,
        name: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        mobile: dto.mobile ?? null,
        website: dto.website ?? null,
        taxId: dto.taxId ?? null,
        reference: dto.reference ?? null,
        jobTitle: dto.jobTitle ?? null,
        street1: dto.street1 ?? null,
        street2: dto.street2 ?? null,
        city: dto.city ?? null,
        zip: dto.zip ?? null,
        countryCode: dto.countryCode ?? null,
        stateCode: dto.stateCode ?? null,
        parentId: dto.parentId ?? null,
        defaultCurrencyId: dto.defaultCurrencyId ?? null,
        creditLimit:
          dto.creditLimit !== undefined ? String(dto.creditLimit) : "0",
        creditApproved: dto.creditApproved ?? false,
        isLocal: dto.isLocal ?? false,
        isActive: dto.isActive ?? true,
      })
      .returning();

    return customer;
  }

  async update(organizationId: string, id: string, dto: UpdateCustomerInput) {
    await this.getById(organizationId, id);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException("Customer cannot be its own parent");
      }

      await this.getById(organizationId, dto.parentId);
    }

    const [customer] = await this.db
      .update(customers)
      .set({
        ...(dto.accountType !== undefined ? { accountType: dto.accountType } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email ?? null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone ?? null } : {}),
        ...(dto.mobile !== undefined ? { mobile: dto.mobile ?? null } : {}),
        ...(dto.website !== undefined ? { website: dto.website ?? null } : {}),
        ...(dto.taxId !== undefined ? { taxId: dto.taxId ?? null } : {}),
        ...(dto.reference !== undefined
          ? { reference: dto.reference ?? null }
          : {}),
        ...(dto.jobTitle !== undefined
          ? { jobTitle: dto.jobTitle ?? null }
          : {}),
        ...(dto.street1 !== undefined ? { street1: dto.street1 ?? null } : {}),
        ...(dto.street2 !== undefined ? { street2: dto.street2 ?? null } : {}),
        ...(dto.city !== undefined ? { city: dto.city ?? null } : {}),
        ...(dto.zip !== undefined ? { zip: dto.zip ?? null } : {}),
        ...(dto.countryCode !== undefined
          ? { countryCode: dto.countryCode ?? null }
          : {}),
        ...(dto.stateCode !== undefined ? { stateCode: dto.stateCode ?? null } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId ?? null } : {}),
        ...(dto.defaultCurrencyId !== undefined
          ? { defaultCurrencyId: dto.defaultCurrencyId ?? null }
          : {}),
        ...(dto.creditLimit !== undefined
          ? { creditLimit: String(dto.creditLimit) }
          : {}),
        ...(dto.creditApproved !== undefined
          ? { creditApproved: dto.creditApproved }
          : {}),
        ...(dto.isLocal !== undefined ? { isLocal: dto.isLocal } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customers.id, id),
          eq(customers.organizationId, organizationId),
        ),
      )
      .returning();

    return customer;
  }

  async setAvatar(
    organizationId: string,
    id: string,
    file: Express.Multer.File,
  ) {
    const existing = await this.getById(organizationId, id);

    const avatarPath = await this.uploadsService.saveCustomerAvatar(
      organizationId,
      id,
      file,
    );

    if (existing.avatarPath && existing.avatarPath !== avatarPath) {
      await this.uploadsService.deleteStoredFile(existing.avatarPath);
    }

    const [customer] = await this.db
      .update(customers)
      .set({ avatarPath, updatedAt: new Date() })
      .where(
        and(
          eq(customers.id, id),
          eq(customers.organizationId, organizationId),
        ),
      )
      .returning();

    return customer;
  }

  async archive(organizationId: string, id: string) {
    await this.getById(organizationId, id);

    const [customer] = await this.db
      .update(customers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(customers.id, id),
          eq(customers.organizationId, organizationId),
        ),
      )
      .returning();

    return customer;
  }

  async restore(organizationId: string, id: string) {
    const [existing] = await this.db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, id),
          eq(customers.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException("Customer not found");
    }

    const [customer] = await this.db
      .update(customers)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(customers.id, id),
          eq(customers.organizationId, organizationId),
        ),
      )
      .returning();

    return customer;
  }
}
