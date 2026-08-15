"use client";

import { Banner, BlockStack, Button, Checkbox, FormLayout, Text, TextField } from "@shopify/polaris";
import { KeyRound, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { authClient, signUp } from "@/lib/auth-client";

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
  const [userAlreadyExists, setUserAlreadyExists] = useState(false);
  const valid = name.trim() && email.trim() && password.length >= 8 && password === confirmPassword && accepted;

  async function waitForSession(maxAttempts = 12) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const session = await authClient.getSession();
      if (session.data?.user) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }

  async function handleSubmit() {
    if (!valid) return setError("Complete all fields and make sure the passwords match.");
    setLoading(true);
    setError(null);
    setUserAlreadyExists(false);

    const result = await signUp.email({ email: email.trim(), password, name: name.trim() });
    if (result.error) {
      setLoading(false);
      const msg = result.error.message ?? "";
      if (msg.toLowerCase().includes("already exists") || result.error.status === 422 || result.error.status === 400) {
        setUserAlreadyExists(true);
        return setError(`An account for ${email.trim()} already exists.`);
      }
      return setError(msg || "Account creation failed.");
    }

    await waitForSession();

    const destination = invited
      ? "/dashboard"
      : redirectTo.startsWith("/") && !redirectTo.startsWith("//")
        ? redirectTo
        : "/dashboard";

    setLoading(false);
    router.push(destination);
    router.refresh();
  }

  const loginUrl = `/login?email=${encodeURIComponent(email.trim() || defaultEmail)}&redirect=${encodeURIComponent(redirectTo)}`;

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
        {invited ? <Banner tone="info">Your invitation will be applied automatically after you log in or sign up.</Banner> : null}
        {userAlreadyExists ? (
          <Banner
            tone="warning"
            title="Account already exists"
            action={{
              content: "Sign in to accept invitation",
              url: loginUrl,
            }}
          >
            <p>
              An account with <strong>{email.trim()}</strong> is already registered. Please sign in with your existing password to join this organization.
            </p>
          </Banner>
        ) : error ? (
          <Banner tone="critical">{error}</Banner>
        ) : null}
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
