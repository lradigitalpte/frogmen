"use client";

import Link from "next/link";
import { Banner, BlockStack, Button, Checkbox, FormLayout, Text, TextField } from "@shopify/polaris";
import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn, authClient } from "@/lib/auth-client";
import { getMe } from "@/lib/security-api";

export function SignInForm({ defaultEmail = "", redirectTo = "/dashboard" }: { defaultEmail?: string; redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const invited = redirectTo.startsWith("/invite/");

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
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setLoading(true);
    setError(null);
    const result = await signIn.email({ email: email.trim(), password, rememberMe });
    if (result.error) {
      setLoading(false);
      return setError(result.error.message ?? "Email or password is incorrect.");
    }

    await waitForSession();

    // mustChangePassword takes top priority — handle it before anything else.
    try {
      const me = await getMe();
      if (me.user.mustChangePassword) {
        setLoading(false);
        router.push("/change-password-required");
        router.refresh();
        return;
      }
    } catch {
      // If we can't read profile, fall through to normal routing.
    }

    // Invite links skip the org selector — go straight to the invite page.
    if (invited) {
      setLoading(false);
      router.push(redirectTo);
      router.refresh();
      return;
    }

    // Check how many organizations this user belongs to.
    try {
      const orgsResult = await authClient.organization.list();
      const orgs = orgsResult.data ?? [];
      if (orgs.length > 1) {
        // Multiple orgs — let the user choose which workspace to enter.
        const safeRedirect =
          redirectTo.startsWith("/") && !redirectTo.startsWith("//")
            ? redirectTo
            : "/dashboard";
        setLoading(false);
        router.push(`/select-organization?redirect=${encodeURIComponent(safeRedirect)}`);
        router.refresh();
        return;
      }
    } catch {
      // If org listing fails, fall through to the normal destination.
    }

    const destination =
      redirectTo.startsWith("/") && !redirectTo.startsWith("//")
        ? redirectTo
        : "/dashboard";

    setLoading(false);
    router.push(destination);
    router.refresh();
  }

  return (
    <div className="auth-form-card">
      <BlockStack gap="500">
        <div className="auth-form-heading">
          <span><LockKeyhole size={20} /></span>
          <div><Text as="h1" variant="headingXl">Welcome back</Text><Text as="p" tone="subdued">Sign in to continue to your organization.</Text></div>
        </div>
        {error ? <Banner tone="critical">{error}</Banner> : null}
        <FormLayout>
          <TextField autoComplete="email" label="Work email" type="email" value={email} onChange={setEmail} placeholder="name@company.com" />
          <TextField autoComplete="current-password" label="Password" type="password" value={password} onChange={setPassword} />
        </FormLayout>
        <div className="auth-form-options"><Checkbox checked={rememberMe} label="Keep me signed in" onChange={setRememberMe} /><Link href={`/forgot-password?email=${encodeURIComponent(email)}`}>Forgot password?</Link></div>
        <Button fullWidth disabled={!email.trim() || !password} loading={loading} variant="primary" onClick={handleSubmit}>Sign in securely</Button>
      </BlockStack>
    </div>
  );
}
