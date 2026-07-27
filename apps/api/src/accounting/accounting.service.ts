import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  accountMoveLines,
  accountMoves,
  glAccounts,
  invoiceLines,
  invoicePayments,
  invoices,
  journals,
  organizations,
  products,
  type Database,
} from "@frog1/db";
import {
  parseOrgCatalogCurrencyId,
  resolveCatalogCurrencyId,
  roundMoney,
} from "@frog1/shared";
import { DATABASE } from "../database/database.constants";
import { ExchangeRatesService } from "../currencies/exchange-rates.service";
import { AccountingProvisionerService } from "./accounting-provisioner.service";

interface MoveLineInput {
  accountCode: string;
  label: string;
  debit: number;
  credit: number;
  customerId?: string;
}

@Injectable()
export class AccountingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly provisioner: AccountingProvisionerService,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  async postCustomerInvoice(
    organizationId: string,
    invoiceId: string,
    _userId?: string,
  ) {
    const [existingMove] = await this.db
      .select({ id: accountMoves.id })
      .from(accountMoves)
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.invoiceId, invoiceId),
          eq(accountMoves.state, "posted"),
        ),
      )
      .limit(1);

    if (existingMove) {
      return existingMove.id;
    }

    const [invoice] = await this.db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.organizationId, organizationId),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);

    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }

    const lines = await this.db
      .select({
        line: invoiceLines,
        product: products,
      })
      .from(invoiceLines)
      .leftJoin(products, eq(products.id, invoiceLines.productId))
      .where(eq(invoiceLines.invoiceId, invoiceId));

    let totalCostBase = 0;

    for (const row of lines) {
      const product = row.product;
      if (!product || product.type === "service") {
        continue;
      }

      const costPrice = Number(product.costPrice ?? 0);
      if (!costPrice) {
        continue;
      }

      const qty = Number(row.line.quantity);
      const costAmount = roundMoney(costPrice * qty);
      const costCurrencyId =
        product.priceCurrencyId ??
        (await this.getCatalogCurrencyId(organizationId));
      const costRate = await this.resolveRate(
        organizationId,
        costCurrencyId,
        invoice.invoiceDate,
      );
      const costAmountBase = roundMoney(costAmount * costRate);

      totalCostBase += costAmountBase;

      await this.db
        .update(invoiceLines)
        .set({
          costAmount: String(costAmount),
          costAmountBase: String(costAmountBase),
        })
        .where(eq(invoiceLines.id, row.line.id));
    }

    const amountUntaxedBase = Number(invoice.amountUntaxedBase);
    const amountTaxBase = Number(invoice.amountTaxBase);
    const amountTotalBase = Number(invoice.amountTotalBase);

    const moveLines: MoveLineInput[] = [
      {
        accountCode: "1100",
        label: `Customer invoice ${invoice.number}`,
        debit: amountTotalBase,
        credit: 0,
        customerId: invoice.customerId,
      },
      {
        accountCode: "4000",
        label: `Revenue ${invoice.number}`,
        debit: 0,
        credit: amountUntaxedBase,
        customerId: invoice.customerId,
      },
    ];

    if (amountTaxBase > 0) {
      moveLines.push({
        accountCode: "2200",
        label: `VAT ${invoice.number}`,
        debit: 0,
        credit: amountTaxBase,
        customerId: invoice.customerId,
      });
    }

    if (totalCostBase > 0) {
      moveLines.push(
        {
          accountCode: "5000",
          label: `COGS ${invoice.number}`,
          debit: totalCostBase,
          credit: 0,
        },
        {
          accountCode: "1200",
          label: `Inventory out ${invoice.number}`,
          debit: 0,
          credit: totalCostBase,
        },
      );
    }

    return this.createPostedMove(organizationId, {
      journalCode: "SALES",
      name: invoice.number,
      reference: invoice.customerReference ?? invoice.number,
      moveDate: invoice.invoiceDate,
      invoiceId,
      lines: moveLines,
    });
  }

  async postCustomerPayment(
    organizationId: string,
    paymentId: string,
    _userId?: string,
  ) {
    const [existingMove] = await this.db
      .select({ id: accountMoves.id })
      .from(accountMoves)
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.paymentId, paymentId),
          eq(accountMoves.state, "posted"),
        ),
      )
      .limit(1);

    if (existingMove) {
      return existingMove.id;
    }

    const [row] = await this.db
      .select({
        payment: invoicePayments,
        invoice: invoices,
      })
      .from(invoicePayments)
      .innerJoin(invoices, eq(invoices.id, invoicePayments.invoiceId))
      .where(
        and(
          eq(invoicePayments.id, paymentId),
          eq(invoicePayments.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException("Payment not found");
    }

    const paymentAmountBase = roundMoney(
      Number(row.payment.amount) * Number(row.payment.exchangeRate ?? 1),
    );

    const journalCode = this.paymentJournalCode(row.payment.method);

    return this.createPostedMove(organizationId, {
      journalCode,
      name: `Payment ${row.invoice.number}`,
      reference: row.payment.reference ?? row.payment.method ?? "Payment",
      moveDate: row.payment.paymentDate,
      paymentId,
      lines: [
        {
          accountCode: journalCode === "CASH" ? "101501" : "101401",
          label: `Payment received ${row.invoice.number}`,
          debit: paymentAmountBase,
          credit: 0,
          customerId: row.invoice.customerId,
        },
        {
          accountCode: "1100",
          label: `AR cleared ${row.invoice.number}`,
          debit: 0,
          credit: paymentAmountBase,
          customerId: row.invoice.customerId,
        },
      ],
    });
  }

  async postCustomerCreditNote(
    organizationId: string,
    input: {
      invoiceId: string;
      number: string;
      creditDate: string;
      untaxedBase: number;
      taxBase: number;
      returnToStock?: boolean;
    },
  ) {
    const reference = `Credit note ${input.number}`;
    const [existing] = await this.db
      .select({ id: accountMoves.id })
      .from(accountMoves)
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.reference, reference),
          eq(accountMoves.state, "posted"),
        ),
      )
      .limit(1);
    if (existing) return existing.id;

    const [costRow] = await this.db
      .select({
        amount: sql<string>`coalesce(sum(${accountMoveLines.debit}::numeric - ${accountMoveLines.credit}::numeric), 0)`,
      })
      .from(accountMoveLines)
      .innerJoin(accountMoves, eq(accountMoves.id, accountMoveLines.moveId))
      .innerJoin(glAccounts, eq(glAccounts.id, accountMoveLines.accountId))
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.invoiceId, input.invoiceId),
          eq(accountMoves.state, "posted"),
          eq(glAccounts.code, "5000"),
        ),
      );
    const costBase = input.returnToStock
      ? Math.max(Number(costRow?.amount ?? 0), 0)
      : 0;

    const lines: MoveLineInput[] = [
      {
        accountCode: "4000",
        label: `Revenue reversal ${input.number}`,
        debit: roundMoney(input.untaxedBase),
        credit: 0,
      },
      {
        accountCode: "1100",
        label: `Customer credit ${input.number}`,
        debit: 0,
        credit: roundMoney(input.untaxedBase + input.taxBase),
      },
    ];
    if (input.taxBase > 0) {
      lines.push({
        accountCode: "2200",
        label: `VAT reversal ${input.number}`,
        debit: roundMoney(input.taxBase),
        credit: 0,
      });
    }
    if (costBase > 0) {
      lines.push(
        {
          accountCode: "1200",
          label: `Inventory value reversal ${input.number}`,
          debit: roundMoney(costBase),
          credit: 0,
        },
        {
          accountCode: "5000",
          label: `COGS reversal ${input.number}`,
          debit: 0,
          credit: roundMoney(costBase),
        },
      );
    }

    return this.createPostedMove(organizationId, {
      journalCode: "SALES",
      name: input.number,
      reference,
      moveDate: input.creditDate,
      invoiceId: input.invoiceId,
      lines,
    });
  }

  async postCustomerRefund(
    organizationId: string,
    input: {
      refundId: string;
      invoiceId: string;
      amountBase: number;
      refundDate: string;
      method: string;
      reference?: string;
    },
  ) {
    const [existing] = await this.db
      .select({ id: accountMoves.id })
      .from(accountMoves)
      .where(eq(accountMoves.refundId, input.refundId))
      .limit(1);
    if (existing) return existing.id;

    const bankCode = input.method === "cash" ? "101501" : "101401";
    return this.createPostedMove(organizationId, {
      journalCode: input.method === "cash" ? "CASH" : "BANK",
      name: `Customer refund ${input.reference ?? ""}`.trim(),
      reference: input.reference ?? "Customer refund",
      moveDate: input.refundDate,
      refundId: input.refundId,
      invoiceId: input.invoiceId,
      lines: [
        { accountCode: "1100", label: "Customer refund", debit: input.amountBase, credit: 0 },
        { accountCode: bankCode, label: "Customer refund paid", debit: 0, credit: input.amountBase },
      ],
    });
  }

  async listExpenses(organizationId: string) {
    await this.provisioner.ensureProvisioned(organizationId);

    const expenseAccount = await this.provisioner.getAccountByCode(
      organizationId,
      "600000",
    );

    if (!expenseAccount) {
      return {
        summary: {
          monthTotal: 0,
          monthCount: 0,
          cashTotal: 0,
          bankTotal: 0,
        },
        expenses: [],
      };
    }

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const rows = await this.db
      .select({
        id: accountMoves.id,
        moveDate: accountMoves.moveDate,
        name: accountMoves.name,
        reference: accountMoves.reference,
        amount: accountMoveLines.debit,
        journalCode: journals.code,
      })
      .from(accountMoveLines)
      .innerJoin(accountMoves, eq(accountMoves.id, accountMoveLines.moveId))
      .innerJoin(journals, eq(journals.id, accountMoves.journalId))
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.state, "posted"),
          eq(accountMoveLines.accountId, expenseAccount.id),
          sql`${accountMoveLines.debit}::numeric > 0`,
        ),
      )
      .orderBy(desc(accountMoves.moveDate), desc(accountMoves.createdAt))
      .limit(100);

    let monthTotal = 0;
    let monthCount = 0;
    let cashTotal = 0;
    let bankTotal = 0;

    const expenses = rows.map((row) => {
      const amount = roundMoney(Number(row.amount));
      const paymentSource = row.journalCode === "CASH" ? "cash" : "bank";
      const inMonth = row.moveDate >= monthStart;

      if (inMonth) {
        monthTotal += amount;
        monthCount += 1;
        if (paymentSource === "cash") cashTotal += amount;
        else bankTotal += amount;
      }

      return {
        id: row.id,
        expenseDate: row.moveDate,
        description: row.name,
        reference: row.reference,
        amount,
        paymentSource,
      };
    });

    return {
      summary: {
        monthTotal: roundMoney(monthTotal),
        monthCount,
        cashTotal: roundMoney(cashTotal),
        bankTotal: roundMoney(bankTotal),
      },
      expenses,
    };
  }

  async createExpense(
    organizationId: string,
    input: {
      amount: number;
      expenseDate: string;
      description: string;
      paymentMethod: string;
      reference?: string;
    },
  ) {
    const journalCode = this.paymentJournalCode(input.paymentMethod);
    const amountBase = roundMoney(input.amount);

    return this.createPostedMove(organizationId, {
      journalCode,
      name: input.description.slice(0, 255),
      reference: input.reference ?? input.description,
      moveDate: input.expenseDate,
      lines: [
        {
          accountCode: "600000",
          label: input.description,
          debit: amountBase,
          credit: 0,
        },
        {
          accountCode: journalCode === "CASH" ? "101501" : "101401",
          label: input.description,
          debit: 0,
          credit: amountBase,
        },
      ],
    });
  }

  async getInvoiceJournal(organizationId: string, invoiceId: string) {
    const paymentRows = await this.db
      .select({ id: invoicePayments.id })
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.organizationId, organizationId),
          eq(invoicePayments.invoiceId, invoiceId),
        ),
      );
    const paymentIds = paymentRows.map((payment) => payment.id);

    const moves = await this.db
      .select()
      .from(accountMoves)
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.state, "posted"),
          paymentIds.length > 0
            ? or(
                eq(accountMoves.invoiceId, invoiceId),
                inArray(accountMoves.paymentId, paymentIds),
              )
            : eq(accountMoves.invoiceId, invoiceId),
        ),
      );

    if (moves.length === 0) {
      return { move: null, lines: [] };
    }

    const move = moves.find((row) => row.invoiceId === invoiceId) ?? moves[0];
    const finalLines = await this.db
      .select({
        id: accountMoveLines.id,
        label: accountMoveLines.label,
        debit: accountMoveLines.debit,
        credit: accountMoveLines.credit,
        lineNumber: accountMoveLines.lineNumber,
        accountCode: glAccounts.code,
        accountName: glAccounts.name,
      })
      .from(accountMoveLines)
      .innerJoin(glAccounts, eq(glAccounts.id, accountMoveLines.accountId))
      .where(
        inArray(
          accountMoveLines.moveId,
          moves.map((row) => row.id),
        ),
      )
      .orderBy(accountMoveLines.createdAt, accountMoveLines.lineNumber);

    return {
      move: {
        id: move.id,
        name: move.name,
        reference: move.reference,
        moveDate: move.moveDate,
        state: move.state,
      },
      lines: finalLines.map((line) => ({
        id: line.id,
        label: line.label,
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: Number(line.debit),
        credit: Number(line.credit),
        lineNumber: line.lineNumber,
      })),
    };
  }

  private paymentJournalCode(method?: string | null) {
    if (method === "cash" || method === "cheque") {
      return "CASH";
    }

    return "BANK";
  }

  private async createPostedMove(
    organizationId: string,
    input: {
      journalCode: string;
      name: string;
      reference?: string;
      moveDate: string;
      invoiceId?: string;
      paymentId?: string;
      refundId?: string;
      lines: MoveLineInput[];
    },
  ) {
    const journal = await this.provisioner.getJournalByCode(
      organizationId,
      input.journalCode,
    );

    if (!journal) {
      throw new BadRequestException(
        `Journal ${input.journalCode} is not configured`,
      );
    }

    const [move] = await this.db
      .insert(accountMoves)
      .values({
        organizationId,
        journalId: journal.id,
        name: input.name,
        reference: input.reference ?? null,
        state: "posted",
        moveDate: input.moveDate,
        invoiceId: input.invoiceId ?? null,
        paymentId: input.paymentId ?? null,
        refundId: input.refundId ?? null,
        postedAt: new Date(),
      })
      .returning();

    let lineNumber = 1;
    for (const line of input.lines) {
      if (line.debit <= 0 && line.credit <= 0) {
        continue;
      }

      const account = await this.provisioner.getAccountByCode(
        organizationId,
        line.accountCode,
      );

      if (!account) {
        throw new BadRequestException(
          `Account ${line.accountCode} is not configured`,
        );
      }

      await this.db.insert(accountMoveLines).values({
        moveId: move.id,
        accountId: account.id,
        customerId: line.customerId ?? null,
        label: line.label,
        debit: String(roundMoney(line.debit)),
        credit: String(roundMoney(line.credit)),
        lineNumber: lineNumber++,
      });
    }

    return move.id;
  }

  private async getBaseCurrencyId(organizationId: string) {
    const [org] = await this.db
      .select({ baseCurrencyId: organizations.baseCurrencyId })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org?.baseCurrencyId) {
      throw new BadRequestException("Organization base currency is not set");
    }

    return org.baseCurrencyId;
  }

  private async resolveRate(
    organizationId: string,
    currencyId: string,
    asOfDate?: string,
  ) {
    const baseCurrencyId = await this.getBaseCurrencyId(organizationId);
    if (baseCurrencyId === currencyId) {
      return 1;
    }

    return this.exchangeRatesService.getRequiredRate(
      organizationId,
      currencyId,
      baseCurrencyId,
      asOfDate,
    );
  }

  private async getCatalogCurrencyId(organizationId: string) {
    const [org] = await this.db
      .select({
        baseCurrencyId: organizations.baseCurrencyId,
        metadata: organizations.metadata,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const currencyId = resolveCatalogCurrencyId(
      org?.baseCurrencyId ?? null,
      parseOrgCatalogCurrencyId(org?.metadata ?? null),
    );
    if (!currencyId) {
      throw new BadRequestException(
        "Organization catalog currency is not configured",
      );
    }

    return currencyId;
  }
}
