import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Session,
} from '@nestjs/common';
import {
  RequireActiveOrg,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { AlertsService } from './alerts.service';
import { ReminderJobsService } from './reminder-jobs.service';
import { RequirePermission } from '../security/require-permission.decorator';

@Controller('v1/alerts')
@RequireActiveOrg()
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly reminderJobsService: ReminderJobsService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error('Active organization is required');
    }

    return organizationId;
  }

  @Get()
  @RequirePermission('invoices.read')
  async getAlerts(@Session() session: UserSession) {
    return this.alertsService.getAlertsSummary(this.orgId(session));
  }

  @Get('metrics')
  @RequirePermission('invoices.read')
  async getMetrics(@Session() session: UserSession) {
    const summary = await this.alertsService.getAlertsSummary(
      this.orgId(session),
    );
    return summary.metrics;
  }

  @Get('overdue-count')
  @RequirePermission('invoices.read')
  async getOverdueCount(@Session() session: UserSession) {
    const count = await this.alertsService.getOverdueCount(this.orgId(session));
    return { count };
  }

  @Post('resend-reminder')
  @RequirePermission('payments.record')
  async resendReminder(
    @Session() session: UserSession,
    @Body()
    dto: {
      alertId: string;
      customerEmail: string;
      customMessage?: string;
    },
  ) {
    return this.alertsService.resendPaymentReminder(this.orgId(session), dto);
  }

  @Post('jobs/run')
  @RequirePermission('settings.manage')
  async runJobs(@Session() session: UserSession) {
    return this.reminderJobsService.runDueJobs(this.orgId(session));
  }

  @Post('automation-rules/create')
  @RequirePermission('settings.manage')
  async createAutomationRule(
    @Session() session: UserSession,
    @Body()
    dto: {
      name: string;
      ruleType: 'customer_payment' | 'internal_follow_up';
      triggerType: 'days_before_due' | 'days_after_due' | 'weekly_digest';
      triggerDays?: number | null;
      recipientEmail?: string | null;
      triggerCondition: string;
      description: string;
    },
  ) {
    return this.alertsService.createAutomationRule(this.orgId(session), dto);
  }

  @Post('automation-rules/:id/run')
  @RequirePermission('settings.manage')
  async runAutomationRule(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.reminderJobsService.runRuleNow(this.orgId(session), id);
  }

  @Delete('automation-rules/:id')
  @RequirePermission('settings.manage')
  async deleteAutomationRule(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.alertsService.deleteAutomationRule(this.orgId(session), id);
  }

  @Post('automation-rules/:id/toggle')
  @RequirePermission('settings.manage')
  async toggleRule(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.alertsService.toggleAutomationRule(
      this.orgId(session),
      id,
      body.enabled,
    );
  }
}
