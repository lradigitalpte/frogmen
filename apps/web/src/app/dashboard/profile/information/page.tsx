"use client";

import { useEffect, useState } from "react";
import {
  BlockStack,
  Button,
  Card,
  FormLayout,
  InlineGrid,
  InlineStack,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import { AppPage } from "@/components/layout/page";
import { updateUser, useSession } from "@/lib/auth-client";
import { useToast } from "@/components/providers/toast-provider";

export default function ProfileInformationPage() {
  const { data: session, isPending } = useSession();
  const { showSuccess, showError } = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name);
    }
  }, [session?.user?.name]);

  async function handleSave() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      showError("Name is required");
      return;
    }

    setSaving(true);

    try {
      const result = await updateUser({ name: trimmedName });

      if (result.error) {
        showError(result.error.message ?? "Failed to update profile");
        return;
      }

      showSuccess("Profile updated");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  if (isPending) {
    return (
      <AppPage title="Profile information">
        <Spinner accessibilityLabel="Loading profile" size="large" />
      </AppPage>
    );
  }

  return (
    <AppPage
      title="Profile information"
      subtitle="Manage how your identity appears across FrogmenDash."
    >
      <BlockStack gap="500">
        <section className="profile-information-hero">
          <div className="profile-information-avatar">
            {(name.trim().charAt(0) || "U").toUpperCase()}
          </div>
          <div>
            <span>Account identity</span>
            <h2>{name.trim() || "Your name"}</h2>
            <p>{session?.user?.email ?? ""}</p>
          </div>
          <div className="profile-information-hero__status">
            <i />
            Active account
          </div>
        </section>

        <InlineGrid columns={{ xs: 1, md: 3 }} gap="500">
          <div className="profile-information-aside">
            <Text as="h2" variant="headingMd">Personal details</Text>
            <Text as="p" tone="subdued">
              Your name appears in activity history, assignments, documents, and
              team member lists.
            </Text>
          </div>
          <div className="profile-information-form">
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Display information</Text>
                  <Text as="p" tone="subdued">Keep your account identity recognizable to your team.</Text>
                </BlockStack>

                <FormLayout>
                  <TextField
                    autoComplete="name"
                    label="Full name"
                    value={name}
                    onChange={setName}
                    helpText="Used throughout the application and audit history."
                  />
                  <TextField
                    autoComplete="email"
                    disabled
                    label="Login email"
                    value={session?.user?.email ?? ""}
                    onChange={() => undefined}
                    helpText="Verified login identity · Contact an organization administrator to change it."
                  />
                </FormLayout>

                <InlineStack align="end">
                  <Button
                    disabled={!name.trim() || name.trim() === session?.user?.name}
                    loading={saving}
                    variant="primary"
                    onClick={handleSave}
                  >
                    Save profile
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
