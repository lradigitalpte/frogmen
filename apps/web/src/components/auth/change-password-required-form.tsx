"use client";

import { AuthLayout } from "@/components/layout/auth-layout";
import { setInitialPassword } from "@/lib/security-api";
import {
  Banner,
  BlockStack,
  Button,
  FormLayout,
  Text,
  TextField,
} from "@shopify/polaris";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ChangePasswordRequiredForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid =
    password.length >= 8 && password === confirmPassword && password.length > 0;

  async function handleSubmit() {
    if (!valid) {
      return setError("Enter a password of at least 8 characters and confirm it.");
    }

    setLoading(true);
    setError(null);

    try {
      await setInitialPassword(password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update your password.",
      );
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-form-card">
        <BlockStack gap="500">
          <div className="auth-form-heading">
            <span>
              <KeyRound size={20} />
            </span>
            <div>
              <Text as="h1" variant="headingXl">
                Set your password
              </Text>
              <Text as="p" tone="subdued">
                Choose a new password before continuing to your organization.
              </Text>
            </div>
          </div>

          <Banner tone="info">
            Your account was created with a temporary password. Set a personal
            password now to finish signing in.
          </Banner>

          {error ? <Banner tone="critical">{error}</Banner> : null}

          <FormLayout>
            <TextField
              autoComplete="new-password"
              helpText="Minimum 8 characters"
              label="New password"
              type="password"
              value={password}
              onChange={setPassword}
            />
            <TextField
              autoComplete="new-password"
              error={
                confirmPassword && confirmPassword !== password
                  ? "Passwords do not match"
                  : undefined
              }
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
          </FormLayout>

          <Button
            fullWidth
            disabled={!valid}
            loading={loading}
            variant="primary"
            onClick={handleSubmit}
          >
            Save password and continue
          </Button>
        </BlockStack>
      </div>
    </AuthLayout>
  );
}
