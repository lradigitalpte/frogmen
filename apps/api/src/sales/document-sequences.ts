import { eq, sql } from "drizzle-orm";
import { branches, documentSequences, type Database } from "@frog1/db";

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
