import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { sql } from "drizzle-orm";
import type { Database } from "@frog1/db";
import { from, lastValueFrom } from "rxjs";
import { RAW_DATABASE } from "../database/database.constants";
import { databaseContext } from "../database/database-context";
import type { SecurityContext } from "./security-context";

type SecurityRequest = Request & { securityContext?: SecurityContext };

@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  constructor(@Inject(RAW_DATABASE) private readonly database: Database) {}

  intercept(executionContext: ExecutionContext, next: CallHandler) {
    const request =
      executionContext.switchToHttp().getRequest<SecurityRequest>();
    const context = request.securityContext;
    const publicReportMatch = request.path.match(
      /^\/v1\/public\/report\/([^/]+)/,
    );

    if (!context && !publicReportMatch) {
      return next.handle();
    }

    return from(
      this.database.transaction(async (transaction) => {
        await transaction.execute(sql.raw("set local role frog1_runtime"));
        if (publicReportMatch) {
          await transaction.execute(
            sql`select set_config('app.share_hash', ${decodeURIComponent(publicReportMatch[1]!)}, true)`,
          );
          return databaseContext.run(
            transaction as unknown as Database,
            () => lastValueFrom(next.handle()),
          );
        }

        await transaction.execute(
          sql`select set_config('app.organization_id', ${context!.organizationId}, true)`,
        );
        await transaction.execute(
          sql`select set_config('app.branch_id', ${context!.activeBranchId ?? ""}, true)`,
        );
        await transaction.execute(
          sql`select set_config('app.user_id', ${context!.userId}, true)`,
        );
        await transaction.execute(
          sql`select set_config('app.all_branches', ${context!.branchScope === "all" ? "true" : "false"}, true)`,
        );

        return databaseContext.run(
          transaction as unknown as Database,
          () => lastValueFrom(next.handle()),
        );
      }),
    );
  }
}
