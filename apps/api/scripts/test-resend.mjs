#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

for (const file of [
  resolve(__dirname, "../../../.env"),
  resolve(__dirname, "../.env"),
  resolve(process.cwd(), ".env"),
]) {
  if (existsSync(file)) {
    config({ path: file });
    break;
  }
}

const railwayVarsFile = resolve(__dirname, "../../../railway.production.variables.json");
if (existsSync(railwayVarsFile)) {
  const railwayVars = JSON.parse(readFileSync(railwayVarsFile, "utf8"));
  for (const [key, value] of Object.entries(railwayVars)) {
    if (!process.env[key] && typeof value === "string" && value.trim()) {
      process.env[key] = value;
    }
  }
}

const to = process.argv[2]?.trim();
if (!to || !to.includes("@")) {
  console.error("Usage: node scripts/test-resend.mjs <recipient@email.com>");
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY ?? process.env.RESEND_KEY;
const fromAddress = process.env.MAIL_FROM_ADDRESS;
const fromName = process.env.MAIL_FROM_NAME ?? "Frogmen";

if (!apiKey) {
  console.error("Missing RESEND_API_KEY (set it in frog1/.env or the environment).");
  process.exit(1);
}

if (!fromAddress) {
  console.error("Missing MAIL_FROM_ADDRESS (set it in frog1/.env or the environment).");
  process.exit(1);
}

const from = `${fromName} <${fromAddress}>`;
const subject = "Frogmen Resend test";
const text = `This is a test email from FrogmenDash.

If you received this, Resend is configured correctly.

Sent at: ${new Date().toISOString()}`;
const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17212b">
  <h2 style="color:#176f75">Resend test</h2>
  <p>This is a test email from <strong>FrogmenDash</strong>.</p>
  <p>If you received this, Resend is configured correctly.</p>
  <p style="color:#6b7280;font-size:13px">Sent at: ${new Date().toISOString()}</p>
</div>`;

console.log(`Sending test email...`);
console.log(`  From: ${from}`);
console.log(`  To:   ${to}`);

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ from, to: [to], subject, text, html }),
});

const body = await response.text();
let parsed;
try {
  parsed = JSON.parse(body);
} catch {
  parsed = body;
}

if (!response.ok) {
  console.error(`Resend failed (${response.status}):`);
  console.error(typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2));
  process.exit(1);
}

console.log("Resend accepted the email.");
console.log(typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2));
console.log(`Check the inbox for ${to} (and spam folder).`);
