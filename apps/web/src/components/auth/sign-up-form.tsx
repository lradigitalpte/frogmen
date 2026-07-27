"use client";

import { Banner, BlockStack, Button, Checkbox, FormLayout, Text, TextField } from "@shopify/polaris";
import { KeyRound, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { signUp } from "@/lib/auth-client";

export function SignUpForm({ defaultEmail = "", redirectTo = "/dashboard" }: { defaultEmail?: string; redirectTo?: string }) {
  const router = useRouter();
  const invited = redirectTo.startsWith("/invite/");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const valid = name.trim() && email.trim() && password.length >= 8 && password === confirmPassword && accepted;

  async function handleSubmit() {
    if (!valid) return setError("Complete all fields and make sure the passwords match.");
    setLoading(true);
    setError(null);
    const result = await signUp.email({ email: email.trim(), password, name: name.trim() });
    setLoading(false);
    if (result.error) return setError(result.error.message ?? "Account creation failed.");
    router.push(redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/dashboard");
    router.refresh();
  }

  return (
    <div className="auth-form-card">
      <BlockStack gap="400">
        <div className="auth-form-heading">
          <span>{invited ? <KeyRound size={20} /> : <UserPlus size={20} />}</span>
          <div>
            <Text as="h1" variant="headingXl">{invited ? "Set up your invited account" : "Create your account"}</Text>
            <Text as="p" tone="subdued">{invited ? "Confirm your identity and choose a secure password." : "Start your secure organization workspace."}</Text>
          </div>
        </div>
        {invited ? <Banner tone="info">You will return to the invitation after creating your password.</Banner> : null}
        {error ? <Banner tone="critical">{error}</Banner> : null}
        <FormLayout>
          <TextField autoComplete="name" label="Full name" value={name} onChange={setName} />
          <TextField autoComplete="email" disabled={invited && Boolean(defaultEmail)} label="Work email" type="email" value={email} onChange={setEmail} />
          <TextField autoComplete="new-password" helpText="Minimum 8 characters" label={invited ? "Create password" : "Password"} type="password" value={password} onChange={setPassword} />
          <TextField autoComplete="new-password" error={confirmPassword && confirmPassword !== password ? "Passwords do not match" : undefined} label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
        </FormLayout>
        <Checkbox checked={accepted} label="I agree to use this workspace securely and protect my account credentials." onChange={setAccepted} />
        <Button fullWidth disabled={!valid} loading={loading} variant="primary" onClick={handleSubmit}>{invited ? "Create account & continue" : "Create secure account"}</Button>
        <div className="auth-form-footer">Already have an account? <Link href={`/login?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectTo)}`}>Sign in</Link></div>
      </BlockStack>
    </div>
  );
}

export function SignUpPage(props: { defaultEmail?: string; redirectTo?: string }) {
  return <AuthLayout><SignUpForm {...props} /></AuthLayout>;
}
