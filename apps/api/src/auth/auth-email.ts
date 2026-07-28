import { renderBrandedEmail } from "@frog1/shared";
import * as nodemailer from "nodemailer";

function fromAddress() {
  return (
    process.env.SMTP_FROM ??
    (process.env.MAIL_FROM_ADDRESS
      ? `${process.env.MAIL_FROM_NAME || "Frogmen"} <${process.env.MAIL_FROM_ADDRESS}>`
      : "Frogmen <noreply@frogmen.local>")
  );
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  url: string;
}) {
  const subject = "Reset your FrogmenDash password";
  const bodyText = `Hello ${input.name || "there"},

We received a request to reset your FrogmenDash password.

If you did not request this, you can safely ignore this email.`;
  const branded = renderBrandedEmail({
    title: "Reset your password",
    bodyText,
    ctaLabel: "Reset password",
    ctaUrl: input.url,
    footerNote: "If you did not request this, you can safely ignore this email.",
  });

  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    await transporter.sendMail({
      from: fromAddress(),
      to: input.to,
      subject,
      text: branded.text,
      html: branded.html,
    });
    return;
  }

  const resendApiKey = process.env.RESEND_API_KEY ?? process.env.RESEND_KEY;
  if (resendApiKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [input.to],
        subject,
        text: branded.text,
        html: branded.html,
      }),
    });
    if (!response.ok) throw new Error(`Password reset email failed (${response.status})`);
    return;
  }

  console.log(`[AUTH MAIL DEV] Password reset requested for ${input.to}; no mail provider is configured.`);
}
