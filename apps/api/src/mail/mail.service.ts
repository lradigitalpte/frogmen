import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
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

  async sendMail(input: SendMailInput) {
    const payload: Mail.Options = {
      from: this.fromAddress(),
      to: input.to,
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

        this.logger.log(`[MAIL SENT] ${input.subject} -> ${input.to}`);
        return { delivered: true, mode: 'resend' as const };
      }

      this.logger.log(
        `[MAIL DEV] To: ${input.to} | Subject: ${input.subject}\n${input.text}${
          input.attachments?.length
            ? `\nAttachments: ${input.attachments.map((item) => item.filename).join(', ')}`
            : ''
        }`,
      );
      return { delivered: false, mode: 'log' as const };
    }

    await this.transporter.sendMail(payload);
    this.logger.log(`[MAIL SENT] ${input.subject} -> ${input.to}`);
    return { delivered: true, mode: 'smtp' as const };
  }
}
