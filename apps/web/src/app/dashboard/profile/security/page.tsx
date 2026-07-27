"use client";

import { useState } from "react";
import {
  BlockStack,
  Button,
  Card,
  Checkbox,
  FormLayout,
  InlineGrid,
  InlineStack,
  Text,
  TextField,
} from "@shopify/polaris";
import { AppPage } from "@/components/layout/page";
import { changePassword } from "@/lib/auth-client";
import { useToast } from "@/components/providers/toast-provider";
import { KeyRound, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";

export default function ProfileSecurityPage() {
  const { showSuccess, showError } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [saving, setSaving] = useState(false);
  const passwordChecks = [
    { label: "At least 8 characters", passed: newPassword.length >= 8 },
    { label: "Upper and lowercase letters", passed: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) },
    { label: "A number or symbol", passed: /[\d\W]/.test(newPassword) },
  ];
  const strength = passwordChecks.filter((check) => check.passed).length;
  const formValid =
    Boolean(currentPassword) &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) {
      showError("Enter your current and new password");
      return;
    }

    if (newPassword !== confirmPassword) {
      showError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      showError("New password must be at least 8 characters");
      return;
    }

    setSaving(true);

    try {
      const result = await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions,
      });

      if (result.error) {
        showError(result.error.message ?? "Failed to change password");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showSuccess("Password updated");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppPage
      title="Password & security"
      subtitle="Protect your account, password, and active sessions."
    >
      <BlockStack gap="500">
        <section className="profile-security-hero">
          <div className="profile-security-hero__icon"><ShieldCheck size={29} /></div>
          <div>
            <span>Account protection</span>
            <h2>Your security settings are active</h2>
            <p>Use a unique password and revoke other sessions when access may be shared.</p>
          </div>
          <div className="profile-security-hero__badge"><i /> Protected</div>
        </section>

        <InlineGrid columns={{ xs: 1, md: 3 }} gap="500">
          <div className="profile-security-aside">
            <div className="profile-security-aside__item">
              <KeyRound size={19} />
              <div><strong>Strong password</strong><small>Use a password you do not reuse elsewhere.</small></div>
            </div>
            <div className="profile-security-aside__item">
              <Smartphone size={19} />
              <div><strong>Session control</strong><small>Sign out other devices after changing it.</small></div>
            </div>
          </div>

          <div className="profile-security-form">
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <LockKeyhole size={20} />
                    <Text as="h2" variant="headingMd">Change password</Text>
                  </InlineStack>
                  <Text as="p" tone="subdued">Confirm your current password before setting a new one.</Text>
                </BlockStack>

                <FormLayout>
                  <TextField
                    autoComplete="current-password"
                    label="Current password"
                    type="password"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                  />
                  <TextField
                    autoComplete="new-password"
                    label="New password"
                    type="password"
                    value={newPassword}
                    onChange={setNewPassword}
                  />
                  {newPassword ? (
                    <div className="password-strength">
                      <div className="password-strength__header">
                        <span>Password strength</span>
                        <strong>{strength === 3 ? "Strong" : strength === 2 ? "Good" : "Weak"}</strong>
                      </div>
                      <div className={`password-strength__bar strength-${strength}`}>
                        <i /><i /><i />
                      </div>
                      <div className="password-strength__checks">
                        {passwordChecks.map((check) => (
                          <span className={check.passed ? "passed" : ""} key={check.label}>
                            <i />{check.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <TextField
                    autoComplete="new-password"
                    error={confirmPassword && confirmPassword !== newPassword ? "Passwords do not match" : undefined}
                    label="Confirm new password"
                    type="password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                  />
                </FormLayout>

                <div className="profile-security-session-option">
                  <Checkbox
                    checked={revokeOtherSessions}
                    label="Sign out of other devices"
                    helpText="Recommended. Your current device remains signed in."
                    onChange={setRevokeOtherSessions}
                  />
                </div>

                <InlineStack align="end">
                  <Button
                    disabled={!formValid}
                    loading={saving}
                    variant="primary"
                    onClick={handleChangePassword}
                  >
                    Update password
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </div>
        </InlineGrid>
      </BlockStack>
    </AppPage>
  );
}
