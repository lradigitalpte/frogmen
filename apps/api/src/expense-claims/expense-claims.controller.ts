import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { UploadsService } from "../uploads/uploads.service";
import { RequirePermission } from "../security/require-permission.decorator";
import { SecurityContextService } from "../security/security-context.service";
import {
  ExpenseClaimsService,
  type ExpenseClaimStatus,
} from "./expense-claims.service";

@Controller("v1/expense-claims")
@RequireActiveOrg()
export class ExpenseClaimsController {
  constructor(
    private readonly expenseClaimsService: ExpenseClaimsService,
    private readonly uploadsService: UploadsService,
    private readonly securityContext: SecurityContextService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      throw new Error("Active organization is required");
    }
    return organizationId;
  }

  @Get("mine")
  @RequirePermission("expense_claims.submit")
  listMine(@Session() session: UserSession) {
    return this.expenseClaimsService.listMine(
      this.orgId(session),
      session.user.id,
    );
  }

  @Get()
  @RequirePermission("expense_claims.review")
  listOrg(
    @Session() session: UserSession,
    @Query("status") status?: ExpenseClaimStatus,
    @Query("submittedByUserId") submittedByUserId?: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
  ) {
    return this.expenseClaimsService.listOrg(this.orgId(session), {
      status,
      submittedByUserId,
      fromDate,
      toDate,
    });
  }

  @Get(":id")
  async getById(@Session() session: UserSession, @Param("id") id: string) {
    const organizationId = this.orgId(session);
    const context = await this.securityContext.resolve({
      sessionId: session.session.id,
      userId: session.user.id,
      organizationId,
      activeBranchId: (
        session.session as typeof session.session & {
          activeBranchId?: string | null;
        }
      ).activeBranchId,
      branchScope: (
        session.session as typeof session.session & {
          branchScope?: string | null;
        }
      ).branchScope,
    });
    return this.expenseClaimsService.getByIdForViewer(
      organizationId,
      id,
      session.user.id,
      context.permissions,
    );
  }

  @Post()
  @RequirePermission("expense_claims.submit")
  create(
    @Session() session: UserSession,
    @Body()
    body: {
      amount: number;
      expenseDate: string;
      description: string;
      reference?: string;
      categoryId?: string;
    },
  ) {
    return this.expenseClaimsService.create(
      this.orgId(session),
      session.user.id,
      body,
    );
  }

  @Patch(":id")
  @RequirePermission("expense_claims.submit")
  update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body()
    body: {
      amount?: number;
      expenseDate?: string;
      description?: string;
      reference?: string | null;
      categoryId?: string | null;
    },
  ) {
    return this.expenseClaimsService.update(
      this.orgId(session),
      session.user.id,
      id,
      body,
    );
  }

  @Delete(":id")
  @RequirePermission("expense_claims.submit")
  remove(@Session() session: UserSession, @Param("id") id: string) {
    return this.expenseClaimsService.remove(
      this.orgId(session),
      session.user.id,
      id,
    );
  }

  @Post(":id/submit")
  @RequirePermission("expense_claims.submit")
  submit(@Session() session: UserSession, @Param("id") id: string) {
    return this.expenseClaimsService.submit(
      this.orgId(session),
      session.user.id,
      id,
    );
  }

  @Post(":id/withdraw")
  @RequirePermission("expense_claims.submit")
  withdraw(@Session() session: UserSession, @Param("id") id: string) {
    return this.expenseClaimsService.withdrawSubmission(
      this.orgId(session),
      session.user.id,
      id,
    );
  }

  @Post(":id/approve")
  @RequirePermission("expense_claims.review")
  approve(@Session() session: UserSession, @Param("id") id: string) {
    return this.expenseClaimsService.approve(
      this.orgId(session),
      session.user.id,
      id,
    );
  }

  @Post(":id/reject")
  @RequirePermission("expense_claims.review")
  reject(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { reason: string },
  ) {
    return this.expenseClaimsService.reject(
      this.orgId(session),
      session.user.id,
      id,
      body.reason,
    );
  }

  @Post(":id/reimburse")
  @RequirePermission("expense_claims.reimburse")
  reimburse(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body()
    body: {
      paymentMethod: string;
      bankAccountId?: string;
      reimbursedDate?: string;
    },
  ) {
    return this.expenseClaimsService.reimburse(
      this.orgId(session),
      session.user.id,
      id,
      body,
    );
  }

  @Post(":id/receipt")
  @RequirePermission("expense_claims.submit")
  @UseInterceptors(
    FileInterceptor("receipt", { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadReceipt(
    @Session() session: UserSession,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.expenseClaimsService.uploadReceipt(
      this.orgId(session),
      session.user.id,
      id,
      file,
    );
  }

  @Get(":id/receipt")
  async serveReceipt(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const organizationId = this.orgId(session);
    const relativePath = await this.expenseClaimsService.getReceiptPath(
      organizationId,
      id,
    );
    const { stream, contentType } =
      await this.uploadsService.getExpenseReceiptStream(
        organizationId,
        relativePath,
      );

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    stream.pipe(res);
  }
}
