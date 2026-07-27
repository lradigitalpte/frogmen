"use client";

import { Banner, BlockStack, Button, FormLayout, Text, TextField } from "@shopify/polaris";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { requestPasswordReset } from "@/lib/auth-client";

export function ForgotPasswordForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const result = await requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (result.error) return setError(result.error.message ?? "Unable to send reset email.");
    setSent(true);
  }

  return (
    <div className="auth-form-card">
      <BlockStack gap="500">
        <div className="auth-form-heading"><span><MailCheck size={20} /></span><div><Text as="h1" variant="headingXl">Reset your password</Text><Text as="p" tone="subdued">We’ll email you a secure password-reset link.</Text></div></div>
        {sent ? <Banner tone="success" title="Check your inbox">If an account exists for {email}, a password-reset link has been sent.</Banner> : null}
        {error ? <Banner tone="critical">{error}</Banner> : null}
        {!sent ? <><FormLayout><TextField autoComplete="email" label="Account email" type="email" value={email} onChange={setEmail} /></FormLayout><Button fullWidth disabled={!email.trim()} loading={loading} variant="primary" onClick={submit}>Send reset link</Button></> : <Button fullWidth onClick={() => setSent(false)}>Send another link</Button>}
        <div className="auth-form-footer"><Link href="/login">← Back to sign in</Link></div>
      </BlockStack>
    </div>
  );
}
