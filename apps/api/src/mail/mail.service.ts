import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderBrandedEmail } from '@frog1/shared';
import * as nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

export interface SendMailInput {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
}

export interface MailDeliveryResult {
  delivered: boolean;
  mode: 'smtp' | 'resend' | 'log' | 'error';
  id?: string;
  error?: string;
}

export interface SendBrandedMailInput {
  to: string;
  replyTo?: string;
  brandName?: string;
  logoUrl?: string | null;
  subject: string;
  title: string;
  bodyText: string;
  bodyHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  extraHtml?: string;
  attachments?: SendMailInput['attachments'];
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
    }
  }

  private fromAddress() {
    const mailFromAddress = this.config.get<string>('MAIL_FROM_ADDRESS');
    const mailFromName = this.config.get<string>('MAIL_FROM_NAME');

    return (
      this.config.get<string>('SMTP_FROM') ??
      (mailFromAddress
        ? `${mailFromName || 'Frogmen'} <${mailFromAddress}>`
        : undefined) ??
      'Frogmen Finance <noreply@frogmen.local>'
    );
  }

  async sendBrandedMail(input: SendBrandedMailInput): Promise<MailDeliveryResult> {
    const branded = renderBrandedEmail({
      brandName: input.brandName,
      logoUrl: input.logoUrl,
      title: input.title,
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      ctaLabel: input.ctaLabel,
      ctaUrl: input.ctaUrl,
      footerNote: input.footerNote,
      extraHtml: input.extraHtml,
    });

    return this.sendMail({
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: branded.text,
      html: branded.html,
      attachments: input.attachments,
    });
  }

  async sendMail(input: SendMailInput): Promise<MailDeliveryResult> {
    const payload: Mail.Options = {
      from: this.fromAddress(),
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text.replace(/\n/g, '<br />'),
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType ?? 'application/pdf',
      })),
    };

    if (!this.transporter) {
      const resendApiKey =
        this.config.get<string>('RESEND_API_KEY') ??
        this.config.get<string>('RESEND_KEY');

      if (resendApiKey) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: payload.from,
            to: [input.to],
            reply_to: input.replyTo,
            subject: input.subject,
            text: input.text,
            html: input.html ?? input.text.replace(/\n/g, '<br />'),
            attachments: input.attachments?.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content.toString('base64'),
            })),
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Resend rejected the email (${response.status}): ${errorBody.slice(0, 500)}`,
          );
        }

        let id: string | undefined;
        try {
          const parsed = (await response.json()) as { id?: string };
          id = parsed.id;
        } catch {
          id = undefined;
        }

        this.logger.log(`[MAIL SENT] ${input.subject} -> ${input.to}`);
        return { delivered: true, mode: 'resend', id };
      }

      this.logger.log(
        `[MAIL DEV] To: ${input.to} | Subject: ${input.subject}\n${input.text}${
          input.attachments?.length
            ? `\nAttachments: ${input.attachments.map((item) => item.filename).join(', ')}`
            : ''
        }`,
      );
      return { delivered: false, mode: 'log' };
    }

    await this.transporter.sendMail(payload);
    this.logger.log(`[MAIL SENT] ${input.subject} -> ${input.to}`);
    return { delivered: true, mode: 'smtp' };
  }
}
