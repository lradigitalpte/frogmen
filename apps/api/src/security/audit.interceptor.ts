import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { from, map, mergeMap } from "rxjs";
import { auditLogs, type Database } from "@frog1/db";
import { DATABASE } from "../database/database.constants";
import type { SecurityContext } from "./security-context";

type AuditRequest = Request & { securityContext?: SecurityContext };

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  intercept(executionContext: ExecutionContext, next: CallHandler) {
    const request = executionContext.switchToHttp().getRequest<AuditRequest>();
    const context = request.securityContext;
    const isMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);

    if (
      !context ||
      !isMutation ||
      request.path.includes("/audit-logs") ||
      request.path.includes("/ensure-organization")
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      mergeMap((result) => {
          const segments = request.path
            .split("/")
            .filter(Boolean)
            .filter((segment) => segment !== "api" && segment !== "v1");
          const resource = segments[0] ?? "unknown";
          const rawRecordId =
            request.params?.id ??
            request.params?.projectId ??
            (result && typeof result === "object" && "id" in result
              ? String(result.id)
              : null);
          const recordId = Array.isArray(rawRecordId)
            ? rawRecordId[0] ?? null
            : rawRecordId;

          return from(this.db.insert(auditLogs).values({
            organizationId: context.organizationId,
            branchId: context.activeBranchId,
            userId: context.userId,
            action: `${request.method.toLowerCase()}.${resource}`,
            resource,
            recordId,
            metadata: { path: request.path },
            ipAddress: request.ip,
            userAgent: request.get("user-agent") ?? null,
          })).pipe(map(() => result));
      }),
    );
  }
}
