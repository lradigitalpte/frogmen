"use client";

import Link from "next/link";
import { Banner, BlockStack, Button, Checkbox, FormLayout, Text, TextField } from "@shopify/polaris";
import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";

export function SignInForm({ defaultEmail = "", redirectTo = "/dashboard" }: { defaultEmail?: string; redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setLoading(true);
    setError(null);
    const result = await signIn.email({ email: email.trim(), password, rememberMe });
    setLoading(false);
    if (result.error) return setError(result.error.message ?? "Email or password is incorrect.");
    router.push(redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/dashboard");
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
        <div className="auth-form-divider"><span>New to FrogmenDash?</span></div>
        <Link className="auth-form-secondary" href={`/signup?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectTo)}`}>Create an account</Link>
      </BlockStack>
    </div>
  );
}
