import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, gte, lte, ne, type SQL } from "drizzle-orm";
import { auditLogs, branches, users, type Database } from "@frog1/db";
import { DATABASE } from "../database/database.constants";
import type { SecurityContext } from "./security-context";

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(
    context: SecurityContext,
    query: {
      branchId?: string;
      userId?: string;
      action?: string;
      resource?: string;
      from?: string;
      to?: string;
      page?: string | number;
      perPage?: string | number;
    },
  ) {
    const filters: SQL[] = [
      eq(auditLogs.organizationId, context.organizationId),
    ];
    if (query.branchId) filters.push(eq(auditLogs.branchId, query.branchId));
    if (query.userId) filters.push(eq(auditLogs.userId, query.userId));
    if (query.action) filters.push(eq(auditLogs.action, query.action));
    if (query.resource) filters.push(eq(auditLogs.resource, query.resource));
    if (query.from) filters.push(gte(auditLogs.createdAt, new Date(query.from)));
    if (query.to) filters.push(lte(auditLogs.createdAt, new Date(query.to)));
    filters.push(ne(auditLogs.action, "post.ensure-organization"));

    const page = Math.max(1, Number(query.page) || 1);
    const perPage = Math.min(100, Math.max(10, Number(query.perPage) || 25));

    return Promise.all([
      this.db
        .select({
          id: auditLogs.id,
          branchId: auditLogs.branchId,
          branchName: branches.name,
          userId: auditLogs.userId,
          userName: users.name,
          userEmail: users.email,
          action: auditLogs.action,
          resource: auditLogs.resource,
          recordId: auditLogs.recordId,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .leftJoin(branches, eq(branches.id, auditLogs.branchId))
        .where(and(...filters))
        .orderBy(desc(auditLogs.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage),
      this.db
        .select({ total: count() })
        .from(auditLogs)
        .where(and(...filters)),
    ]).then(([data, totalRows]) => ({
      data,
      pagination: {
        page,
        perPage,
        total: totalRows[0]?.total ?? 0,
        totalPages: Math.max(1, Math.ceil((totalRows[0]?.total ?? 0) / perPage)),
      },
    }));
  }
}
