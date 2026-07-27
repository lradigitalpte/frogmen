import * as nodemailer from "nodemailer";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

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
  const safeName = escapeHtml(input.name || "there");
  const safeUrl = escapeHtml(input.url);
  const text = `Hello ${input.name || "there"},

We received a request to reset your FrogmenDash password.

Reset your password: ${input.url}

If you did not request this, you can safely ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17212b">
    <h2 style="color:#173b55">Reset your password</h2>
    <p>Hello ${safeName},</p>
    <p>We received a request to reset your FrogmenDash password.</p>
    <p style="margin:28px 0"><a href="${safeUrl}" style="padding:12px 18px;border-radius:8px;background:#176f75;color:#fff;text-decoration:none;font-weight:700">Reset password</a></p>
    <p style="color:#6b7280;font-size:13px">If you did not request this, you can safely ignore this email.</p>
  </div>`;

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
    await transporter.sendMail({ from: fromAddress(), to: input.to, subject, text, html });
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
      body: JSON.stringify({ from: fromAddress(), to: [input.to], subject, text, html }),
    });
    if (!response.ok) throw new Error(`Password reset email failed (${response.status})`);
    return;
  }

  console.log(`[AUTH MAIL DEV] Password reset requested for ${input.to}; no mail provider is configured.`);
}
