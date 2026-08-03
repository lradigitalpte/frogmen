import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { SettingsModule } from "../settings/settings.module";
import { DocumentBankAccountsService } from "./document-bank-accounts.service";
import { DocumentRendererService } from "./document-renderer.service";
import { PdfService } from "./pdf.service";

@Module({
  imports: [DatabaseModule, SettingsModule],
  providers: [DocumentBankAccountsService, DocumentRendererService, PdfService],
  exports: [DocumentRendererService, PdfService],
})
export class DocumentsModule {}
