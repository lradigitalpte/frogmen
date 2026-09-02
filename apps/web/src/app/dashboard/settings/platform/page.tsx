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
  resetPlatformOrganizationUserPassword,
  type PlatformOrganization,
  type PlatformOrganizationMember,
  type ResetOrganizationPasswordResult,
} from "@/lib/platform-api";
import { getMe } from "@/lib/security-api";

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function PlatformAdminSettingsPage() {
  const [rows, setRows] = useState<PlatformOrganization[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<PlatformOrganization | null>(null);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [pendingReset, setPendingReset] =
    useState<PlatformOrganization | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [issuedPassword, setIssuedPassword] =
    useState<ResetOrganizationPasswordResult | null>(null);

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
      setCurrentUserId(me.user.id);
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

  const closeResetModal = () => {
    if (resettingUserId) return;
    setPendingReset(null);
    setIssuedPassword(null);
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

  const handleResetPassword = async (member: PlatformOrganizationMember) => {
    if (!pendingReset) return;
    setResettingUserId(member.userId);
    setError(null);
    setSuccess(null);
    try {
      const result = await resetPlatformOrganizationUserPassword(
        pendingReset.id,
        member.userId,
      );
      setIssuedPassword(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to reset password",
      );
    } finally {
      setResettingUserId(null);
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
      subtitle="List organizations, reset member passwords, and permanently delete tenants. Backup export comes later."
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
          undone. Resetting a password signs that user out and gives you a
          temporary password to share; they must change it on next sign-in.
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
                    <InlineStack gap="200" wrap={false}>
                      <Button
                        variant="plain"
                        onClick={() => {
                          setSuccess(null);
                          setError(null);
                          setIssuedPassword(null);
                          setPendingReset(row);
                        }}
                      >
                        Reset password
                      </Button>
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
                    </InlineStack>
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

      <Modal
        open={Boolean(pendingReset)}
        title="Reset member password"
        onClose={closeResetModal}
        secondaryActions={[
          {
            content: issuedPassword ? "Done" : "Close",
            onAction: closeResetModal,
            disabled: Boolean(resettingUserId),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {issuedPassword ? (
              <>
                <Banner tone="success">
                  Temporary password created for {issuedPassword.email}. Share
                  it once, then they will be asked to set a new password on
                  sign-in.
                </Banner>
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p">
                      <Text as="span" tone="subdued">
                        Email:{" "}
                      </Text>
                      {issuedPassword.email}
                    </Text>
                    <Button
                      size="slim"
                      onClick={() =>
                        void copyText(issuedPassword.email).then(() =>
                          setSuccess("Email copied."),
                        )
                      }
                    >
                      Copy
                    </Button>
                  </InlineStack>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p">
                      <Text as="span" tone="subdued">
                        Temporary password:{" "}
                      </Text>
                      {issuedPassword.temporaryPassword}
                    </Text>
                    <Button
                      size="slim"
                      onClick={() =>
                        void copyText(issuedPassword.temporaryPassword).then(
                          () => setSuccess("Password copied."),
                        )
                      }
                    >
                      Copy
                    </Button>
                  </InlineStack>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p">
                      <Text as="span" tone="subdued">
                        Sign-in link:{" "}
                      </Text>
                      {issuedPassword.loginUrl}
                    </Text>
                    <Button
                      size="slim"
                      onClick={() =>
                        void copyText(issuedPassword.loginUrl).then(() =>
                          setSuccess("Sign-in link copied."),
                        )
                      }
                    >
                      Copy
                    </Button>
                  </InlineStack>
                </BlockStack>
              </>
            ) : (
              <>
                <Text as="p">
                  Choose a member of{" "}
                  <Text as="span" fontWeight="semibold">
                    {pendingReset?.name}
                  </Text>
                  . They will be signed out and must use the temporary password
                  you share.
                </Text>
                {(pendingReset?.members ?? []).length === 0 ? (
                  <Text as="p" tone="subdued">
                    This organization has no members.
                  </Text>
                ) : (
                  <BlockStack gap="200">
                    {(pendingReset?.members ?? []).map((member) => {
                      const isSelf = member.userId === currentUserId;
                      return (
                        <InlineStack
                          key={member.userId}
                          align="space-between"
                          blockAlign="center"
                          wrap
                        >
                          <BlockStack gap="100">
                            <Text as="span" fontWeight="semibold">
                              {member.email}
                            </Text>
                            <Text as="span" tone="subdued">
                              {member.name} · {member.role}
                              {isSelf ? " · you" : ""}
                            </Text>
                          </BlockStack>
                          <Button
                            size="slim"
                            disabled={isSelf || Boolean(resettingUserId)}
                            loading={resettingUserId === member.userId}
                            onClick={() => void handleResetPassword(member)}
                          >
                            Reset password
                          </Button>
                        </InlineStack>
                      );
                    })}
                  </BlockStack>
                )}
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
