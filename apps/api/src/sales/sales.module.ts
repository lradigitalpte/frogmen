import { Module } from '@nestjs/common';
import { CurrenciesModule } from '../currencies/currencies.module';
import { DatabaseModule } from '../database/database.module';
import { DocumentsModule } from '../documents/documents.module';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { UploadsModule } from '../uploads/uploads.module';
import { QuotationsController } from './quotations.controller';
import { PublicQuotationsController } from './public-quotations.controller';
import { QuotationsService } from './quotations.service';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { ReminderJobsService } from './reminder-jobs.service';
import { QuotationFollowupsController } from './quotation-followups.controller';
import { QuotationFollowupsService } from './quotation-followups.service';

@Module({
  imports: [DatabaseModule, MailModule, DocumentsModule, SettingsModule, CurrenciesModule, UploadsModule],
  controllers: [QuotationsController, PublicQuotationsController, AlertsController, QuotationFollowupsController],
  providers: [QuotationsService, AlertsService, ReminderJobsService, QuotationFollowupsService],
  exports: [AlertsService, ReminderJobsService],
})
export class SalesModule {}
