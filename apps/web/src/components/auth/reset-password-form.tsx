"use client";

import { Banner, BlockStack, Button, FormLayout, Text, TextField } from "@shopify/polaris";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { resetPassword } from "@/lib/auth-client";

export function ResetPasswordForm({ token, invalidToken }: { token?: string; invalidToken?: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(invalidToken ? "This reset link is invalid or has expired." : null);

  async function submit() {
    if (!token || password.length < 8 || password !== confirm) return;
    setLoading(true);
    const result = await resetPassword({ newPassword: password, token });
    setLoading(false);
    if (result.error) return setError(result.error.message ?? "Unable to reset password.");
    setComplete(true);
  }

  return (
    <div className="auth-form-card">
      <BlockStack gap="500">
        <div className="auth-form-heading"><span><ShieldCheck size={20} /></span><div><Text as="h1" variant="headingXl">{complete ? "Password updated" : "Choose a new password"}</Text><Text as="p" tone="subdued">{complete ? "Your account is ready to use." : "Create a strong password you do not use elsewhere."}</Text></div></div>
        {complete ? <Banner tone="success">Your password has been reset successfully.</Banner> : null}
        {error ? <Banner tone="critical">{error}</Banner> : null}
        {!complete && token ? <><FormLayout><TextField autoComplete="new-password" helpText="Minimum 8 characters" label="New password" type="password" value={password} onChange={setPassword} /><TextField autoComplete="new-password" error={confirm && confirm !== password ? "Passwords do not match" : undefined} label="Confirm new password" type="password" value={confirm} onChange={setConfirm} /></FormLayout><Button fullWidth disabled={password.length < 8 || password !== confirm} loading={loading} variant="primary" onClick={submit}>Set new password</Button></> : null}
        <div className="auth-form-footer"><Link href="/login">{complete ? "Continue to sign in" : "Return to sign in"}</Link></div>
      </BlockStack>
    </div>
  );
}
