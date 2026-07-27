import { AuthLayout } from "@/components/layout/auth-layout";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const query = await searchParams;
  return <AuthLayout><ForgotPasswordForm defaultEmail={query.email} /></AuthLayout>;
}
