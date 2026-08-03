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
import { ExpenseCategoriesService } from "./expense-categories.service";
import { ExpensesService } from "./expenses.service";
import { UploadsService } from "../uploads/uploads.service";

@Controller("v1/expense-categories")
@RequireActiveOrg()
export class ExpenseCategoriesController {
  constructor(
    private readonly expenseCategoriesService: ExpenseCategoriesService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      throw new Error("Active organization is required");
    }
    return organizationId;
  }

  @Get()
  list(
    @Session() session: UserSession,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("perPage") perPage?: string,
  ) {
    return this.expenseCategoriesService.list(this.orgId(session), {
      search,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });
  }

  @Post("seed-default")
  seedDefaults(@Session() session: UserSession) {
    return this.expenseCategoriesService.seedDefaults(this.orgId(session));
  }

  @Post()
  create(@Session() session: UserSession, @Body() body: { name: string }) {
    return this.expenseCategoriesService.create(this.orgId(session), body.name);
  }

  @Patch(":id")
  update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { name: string },
  ) {
    return this.expenseCategoriesService.update(
      this.orgId(session),
      id,
      body.name,
    );
  }

  @Delete(":id")
  archive(@Session() session: UserSession, @Param("id") id: string) {
    return this.expenseCategoriesService.archive(this.orgId(session), id);
  }
}

@Controller("v1/expenses")
@RequireActiveOrg()
export class ExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly uploadsService: UploadsService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      throw new Error("Active organization is required");
    }
    return organizationId;
  }

  @Get()
  list(@Session() session: UserSession) {
    return this.expensesService.list(this.orgId(session));
  }

  @Get(":id")
  getById(@Session() session: UserSession, @Param("id") id: string) {
    return this.expensesService.getById(this.orgId(session), id);
  }

  @Post()
  create(
    @Session() session: UserSession,
    @Body()
    body: {
      amount: number;
      expenseDate: string;
      description: string;
      paymentMethod: string;
      reference?: string;
      bankAccountId?: string;
      categoryId?: string;
    },
  ) {
    return this.expensesService.create(
      this.orgId(session),
      session.user.id,
      body,
    );
  }

  @Patch(":id")
  update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body()
    body: {
      amount?: number;
      expenseDate?: string;
      description?: string;
      paymentMethod?: string;
      reference?: string | null;
      bankAccountId?: string | null;
      categoryId?: string | null;
    },
  ) {
    return this.expensesService.update(this.orgId(session), id, body);
  }

  @Delete(":id")
  remove(@Session() session: UserSession, @Param("id") id: string) {
    return this.expensesService.remove(this.orgId(session), id);
  }

  @Post(":id/receipt")
  @UseInterceptors(
    FileInterceptor("receipt", { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadReceipt(
    @Session() session: UserSession,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.expensesService.uploadReceipt(
      this.orgId(session),
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
    const relativePath = await this.expensesService.getReceiptPath(
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
