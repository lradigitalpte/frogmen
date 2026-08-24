import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DocumentsModule } from "../documents/documents.module";
import { MailModule } from "../mail/mail.module";
import { SettingsModule } from "../settings/settings.module";
import {
  DeliveryNotesController,
  InvoiceDeliveryNotesController,
} from "./delivery-notes.controller";
import { DeliveryNotesService } from "./delivery-notes.service";

@Module({
  imports: [DatabaseModule, DocumentsModule, MailModule, SettingsModule],
  controllers: [DeliveryNotesController, InvoiceDeliveryNotesController],
  providers: [DeliveryNotesService],
  exports: [DeliveryNotesService],
})
export class DeliveryNotesModule {}
