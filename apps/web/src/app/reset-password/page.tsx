import { AuthLayout } from "@/components/layout/auth-layout";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  return <AuthLayout><ResetPasswordForm token={query.token} invalidToken={Boolean(query.error) || !query.token} /></AuthLayout>;
}
