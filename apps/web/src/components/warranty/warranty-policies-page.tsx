"use client";

import {
  Banner,
  BlockStack,
  Button,
  Card,
  EmptyState,
  InlineGrid,
  InlineStack,
  Modal,
  Tag,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import {
  createWarrantyPolicy,
  listWarrantyPolicies,
  seedDefaultWarrantyPolicy,
  updateWarrantyPolicy,
  type WarrantyPolicy,
} from "@/lib/warranty-api";

export function WarrantyPoliciesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [policies, setPolicies] = useState<WarrantyPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WarrantyPolicy | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMonths, setDurationMonths] = useState("12");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listWarrantyPolicies({
        search: debouncedSearch || undefined,
        perPage: 200,
      });
      setPolicies(result.data);

      if (result.data.length === 0 && !debouncedSearch) {
        try {
          await seedDefaultWarrantyPolicy();
          const seeded = await listWarrantyPolicies({ perPage: 200 });
          setPolicies(seeded.data);
        } catch {
          // ignore seed failures; user can add manually
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  function openCreateModal() {
    setEditing(null);
    setName("");
    setDescription("");
    setDurationMonths("12");
    setModalOpen(true);
  }

  function openEditModal(policy: WarrantyPolicy) {
    setEditing(policy);
    setName(policy.name);
    setDescription(policy.description ?? "");
    setDurationMonths(String(policy.durationMonths));
    setModalOpen(true);
  }

  async function handleSave() {
    const trimmedName = name.trim();
    const months = Number(durationMonths);

    if (!trimmedName) {
      setError("Policy name is required");
      return;
    }

    if (!Number.isInteger(months) || months < 1) {
      setError("Duration must be at least 1 month");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (editing) {
        await updateWarrantyPolicy(editing.id, {
          name: trimmedName,
          description: description.trim() || undefined,
          durationMonths: months,
        });
        setSuccess(`Updated “${trimmedName}”`);
      } else {
        await createWarrantyPolicy({
          name: trimmedName,
          description: description.trim() || undefined,
          durationMonths: months,
        });
        setSuccess(`Created “${trimmedName}”`);
      }

      setModalOpen(false);
      await loadPolicies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(policy: WarrantyPolicy) {
    setError(null);
    setSuccess(null);

    try {
      await updateWarrantyPolicy(policy.id, { isActive: !policy.isActive });
      setSuccess(
        policy.isActive
          ? `Deactivated “${policy.name}”`
          : `Activated “${policy.name}”`,
      );
      await loadPolicies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update policy");
    }
  }

  async function handleSeedDefault() {
    setError(null);
    setSuccess(null);

    try {
      const policy = await seedDefaultWarrantyPolicy();
      setSuccess(
        policy.data.length > 0
          ? `Starter policies ready (${policy.data.length})`
          : "Starter policies ready",
      );
      await loadPolicies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed policy");
    }
  }

  return (
    <AppPage
      backAction={{ content: "Warranty", url: "/dashboard/warranty" }}
      fullWidth
      primaryAction={{
        content: "New policy",
        onAction: openCreateModal,
      }}
      secondaryActions={[
        {
          content: "Add starter policies",
          onAction: () => void handleSeedDefault(),
        },
      ]}
      subtitle="Define warranty coverage terms used on products and sales."
      title="Warranty policies"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {success ? (
          <Banner tone="success" onDismiss={() => setSuccess(null)}>
            {success}
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <TextField
              autoComplete="off"
              label="Search policies"
              labelHidden
              onChange={setSearch}
              placeholder="Search policies"
              value={search}
            />

            {loading ? (
              <Text as="p" tone="subdued">
                Loading policies…
              </Text>
            ) : policies.length === 0 ? (
              <EmptyState
                action={{ content: "Create policy", onAction: openCreateModal }}
                heading="No warranty policies yet"
                image=""
              >
                <p>Create policies or add the default 12-month manufacturer warranty.</p>
              </EmptyState>
            ) : (
              <BlockStack gap="300">
                {policies.map((policy) => (
                  <Card key={policy.id}>
                    <InlineGrid columns={{ xs: 1, md: "1fr auto" }} gap="300">
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h3" variant="headingSm">
                            {policy.name}
                          </Text>
                          <Tag>{policy.durationMonths} months</Tag>
                          {!policy.isActive ? <Tag>Inactive</Tag> : null}
                        </InlineStack>
                        {policy.description ? (
                          <Text as="p" tone="subdued">
                            {policy.description}
                          </Text>
                        ) : null}
                      </BlockStack>
                      <InlineStack gap="200">
                        <Button onClick={() => openEditModal(policy)}>Edit</Button>
                        <Button
                          onClick={() => void handleToggleActive(policy)}
                          variant="tertiary"
                        >
                          {policy.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </InlineStack>
                    </InlineGrid>
                  </Card>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      <Modal
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        primaryAction={{
          content: editing ? "Save changes" : "Create policy",
          loading: saving,
          onAction: () => void handleSave(),
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setModalOpen(false) },
        ]}
        title={editing ? "Edit warranty policy" : "New warranty policy"}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField
              autoComplete="off"
              label="Policy name"
              onChange={setName}
              value={name}
            />
            <TextField
              autoComplete="off"
              label="Description"
              multiline={3}
              onChange={setDescription}
              value={description}
            />
            <TextField
              autoComplete="off"
              label="Duration (months)"
              onChange={setDurationMonths}
              type="number"
              value={durationMonths}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
