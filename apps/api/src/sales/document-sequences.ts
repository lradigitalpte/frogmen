import { and, eq, sql } from "drizzle-orm";
import {
  branches,
  deliveryNotes,
  documentSequences,
  expenseClaims,
  expenses,
  invoices,
  organizations,
  purchaseOrders,
  salesOrders,
  type Database,
} from "@frog1/db";
import { parseOrgDocumentTemplates, resolveDocumentTemplates } from "@frog1/shared";
import { randomBytes, randomInt } from "crypto";

const ALPHANUMERIC_CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 30 characters (excludes 0/O, 1/I)

function generateAlphanumericSuffix(length = 5): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHANUMERIC_CHARSET[bytes[i] % ALPHANUMERIC_CHARSET.length];
  }
  return result;
}

function generateNumericSuffix(length = 5): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(randomInt(min, max + 1));
}

function generateDateRandomSuffix(): string {
  const yy = String(new Date().getFullYear()).slice(-2);
  const digits = generateNumericSuffix(5);
  return `${yy}-${digits}`;
}

async function isDocumentNumberExists(
  db: Database,
  organizationId: string,
  documentType: string,
  candidateNumber: string,
): Promise<boolean> {
  const normalizedType = documentType.toLowerCase();

  if (normalizedType === "quotation" || normalizedType === "sales_order") {
    const [row] = await db
      .select({ id: salesOrders.id })
      .from(salesOrders)
      .where(and(eq(salesOrders.organizationId, organizationId), eq(salesOrders.number, candidateNumber)))
      .limit(1);
    return Boolean(row);
  }

  if (normalizedType === "invoice" || normalizedType === "credit_note" || normalizedType === "supplier_invoice") {
    const [row] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.number, candidateNumber)))
      .limit(1);
    return Boolean(row);
  }

  if (normalizedType === "delivery_note") {
    const [row] = await db
      .select({ id: deliveryNotes.id })
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.organizationId, organizationId), eq(deliveryNotes.number, candidateNumber)))
      .limit(1);
    return Boolean(row);
  }

  if (normalizedType === "purchase_order" || normalizedType === "purchase_receipt") {
    const [row] = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.organizationId, organizationId), eq(purchaseOrders.number, candidateNumber)))
      .limit(1);
    return Boolean(row);
  }

  if (normalizedType === "expense") {
    const [row] = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.organizationId, organizationId), eq(expenses.number, candidateNumber)))
      .limit(1);
    return Boolean(row);
  }

  if (normalizedType === "expense_claim") {
    const [row] = await db
      .select({ id: expenseClaims.id })
      .from(expenseClaims)
      .where(and(eq(expenseClaims.organizationId, organizationId), eq(expenseClaims.number, candidateNumber)))
      .limit(1);
    return Boolean(row);
  }

  return false;
}

export async function nextDocumentNumber(
  db: Database,
  organizationId: string,
  documentType: string,
  prefix: string,
) {
  const [branch] = await db
    .select({ documentPrefix: branches.documentPrefix })
    .from(branches)
    .where(eq(branches.id, sql`app_current_branch_id()`))
    .limit(1);
  const effectivePrefix = `${branch?.documentPrefix ?? "MAIN"}-${prefix}`;

  // Fetch organization numbering format preference
  const [org] = await db
    .select({ metadata: organizations.metadata })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  const templates = resolveDocumentTemplates(parseOrgDocumentTemplates(org?.metadata ?? null));
  const format = templates.documentNumberingFormat;

  if (format === "sequential") {
    const [sequence] = await db
      .insert(documentSequences)
      .values({
        organizationId,
        documentType,
        prefix: effectivePrefix,
        nextNumber: 2,
      })
      .onConflictDoUpdate({
        target: [
          documentSequences.organizationId,
          documentSequences.branchId,
          documentSequences.documentType,
        ],
        set: {
          nextNumber: sql`${documentSequences.nextNumber} + 1`,
          prefix: effectivePrefix,
          updatedAt: new Date(),
        },
      })
      .returning({
        nextNumber: documentSequences.nextNumber,
        prefix: documentSequences.prefix,
      });

    return `${sequence.prefix}${String(sequence.nextNumber - 1).padStart(5, "0")}`;
  }

  // Random generator with collision detection (up to 10 retries)
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix: string;
    if (format === "numeric_random") {
      suffix = generateNumericSuffix(5);
    } else if (format === "date_random") {
      suffix = generateDateRandomSuffix();
    } else {
      // Default: alphanumeric_random
      suffix = generateAlphanumericSuffix(5);
    }

    const candidate = `${effectivePrefix}${suffix}`;
    const taken = await isDocumentNumberExists(db, organizationId, documentType, candidate);
    if (!taken) {
      return candidate;
    }
  }

  // Fallback in case of multiple collisions: use 6-char alphanumeric
  return `${effectivePrefix}${generateAlphanumericSuffix(6)}`;
}
