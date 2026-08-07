"use client";

import {
  Banner,
  BlockStack,
  Button,
  IndexTable,
  InlineStack,
  Modal,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { ApiError } from "@/lib/api";
import {
  deletePlatformOrganization,
  listPlatformOrganizations,
  type PlatformOrganization,
} from "@/lib/platform-api";
import { getMe } from "@/lib/security-api";

export default function PlatformAdminSettingsPage() {
  const [rows, setRows] = useState<PlatformOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<PlatformOrganization | null>(null);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await getMe();
      if (!me.isPlatformAdmin) {
        setAuthorized(false);
        setRows([]);
        return;
      }
      setAuthorized(true);
      const organizations = await listPlatformOrganizations();
      setRows(organizations);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load organizations",
      );
      setAuthorized(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeDeleteModal = () => {
    if (deleting) return;
    setPendingDelete(null);
    setConfirmSlug("");
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await deletePlatformOrganization(
        pendingDelete.id,
        confirmSlug,
      );
      setSuccess(
        `Deleted “${result.name}”` +
          (result.deletedOrphanUsers > 0
            ? ` and ${result.deletedOrphanUsers} user${result.deletedOrphanUsers === 1 ? "" : "s"} with no other organizations.`
            : "."),
      );
      setPendingDelete(null);
      setConfirmSlug("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to delete organization",
      );
    } finally {
      setDeleting(false);
    }
  };

  const confirmMatches =
    Boolean(pendingDelete) &&
    confirmSlug.trim() === (pendingDelete?.slug ?? "");

  if (authorized === false && !loading) {
    return (
      <AppPage
        title="Platform admin"
        subtitle="Cross-tenant organization controls."
      >
        <Banner tone="critical">
          You do not have platform admin access. Ask an operator to add your
          email to PLATFORM_ADMIN_EMAILS.
        </Banner>
      </AppPage>
    );
  }

  return (
    <AppPage
      title="Platform admin"
      subtitle="List and permanently delete organizations across all tenants. Backup export comes later."
      primaryAction={{
        content: "Refresh",
        onAction: () => void load(),
        loading,
      }}
    >
      <BlockStack gap="400">
        {error ? <Banner tone="critical">{error}</Banner> : null}
        {success ? (
          <Banner tone="success" onDismiss={() => setSuccess(null)}>
            {success}
          </Banner>
        ) : null}

        <Banner tone="warning">
          Deleting an organization removes its members, branches, sales,
          inventory, and related data. Users who only belonged to that
          organization are removed so their email can be reused. This cannot be
          undone.
        </Banner>

        {loading ? (
          <InlineStack align="center">
            <Spinner />
          </InlineStack>
        ) : (
          <IndexSurface>
            <IndexTable
              resourceName={{
                singular: "organization",
                plural: "organizations",
              }}
              itemCount={rows.length}
              headings={[
                { title: "Organization" },
                { title: "Slug" },
                { title: "Members" },
                { title: "Owners" },
                { title: "Created" },
                { title: "Actions" },
              ]}
              selectable={false}
            >
              {rows.map((row, index) => (
                <IndexTable.Row id={row.id} key={row.id} position={index}>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">
                      {row.name}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" tone="subdued">
                      {row.slug}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{row.memberCount}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" tone="subdued">
                      {row.ownerEmails.length > 0
                        ? row.ownerEmails.join(", ")
                        : "—"}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {new Date(row.createdAt).toLocaleString()}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button
                      tone="critical"
                      variant="plain"
                      onClick={() => {
                        setSuccess(null);
                        setError(null);
                        setPendingDelete(row);
                        setConfirmSlug("");
                      }}
                    >
                      Delete
                    </Button>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </IndexSurface>
        )}
      </BlockStack>

      <Modal
        open={Boolean(pendingDelete)}
        title="Delete organization?"
        onClose={closeDeleteModal}
        primaryAction={{
          content: "Delete permanently",
          destructive: true,
          loading: deleting,
          disabled: !confirmMatches,
          onAction: () => void handleDelete(),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: closeDeleteModal,
            disabled: deleting,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              This will permanently delete{" "}
              <Text as="span" fontWeight="semibold">
                {pendingDelete?.name}
              </Text>{" "}
              and all of its tenant data. Users with no other organization
              memberships will also be deleted.
            </Text>
            <TextField
              autoComplete="off"
              label={`Type “${pendingDelete?.slug ?? ""}” to confirm`}
              value={confirmSlug}
              onChange={setConfirmSlug}
              disabled={deleting}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
