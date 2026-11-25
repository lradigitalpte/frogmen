"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  IndexTable,
  InlineStack,
  Modal,
  Text,
} from "@shopify/polaris";
import { useCallback, useEffect, useRef, useState } from "react";
import { IndexSurface } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { formatAppDateTime } from "@/lib/format-date";
import {
  deletePlatformBackup,
  listPlatformBackups,
  platformBackupDownloadUrl,
  startPlatformBackup,
  type PlatformBackup,
  type PlatformOrganization,
} from "@/lib/platform-api";

function fileSize(bytes: number | null) {
  if (bytes === null) return "—";
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: PlatformBackup["status"] }) {
  if (status === "ready") return <Badge tone="success">Ready</Badge>;
  if (status === "failed") return <Badge tone="critical">Failed</Badge>;
  return <Badge tone="attention">Running</Badge>;
}

interface PlatformBackupsProps {
  organizations: PlatformOrganization[];
  /** A new object starts a backup of that organization. */
  request: PlatformOrganization | null;
}

export function PlatformBackups({ organizations, request }: PlatformBackupsProps) {
  const { showSuccess, showError } = useToast();
  const [backups, setBackups] = useState<PlatformBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingAll, setStartingAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PlatformBackup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const handledRequest = useRef<PlatformOrganization | null>(null);

  const load = useCallback(async () => {
    try {
      setBackups(await listPlatformBackups());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load backups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const running = backups.some((b) => b.status === "running");
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [running, load]);

  const start = useCallback(
    async (organization: PlatformOrganization) => {
      try {
        await startPlatformBackup(organization.id);
        showSuccess(`Backing up ${organization.name}`);
      } catch (err) {
        showError(`${organization.name}: ${err instanceof Error ? err.message : "backup didn't start"}`);
      }
      await load();
    },
    [load, showError, showSuccess],
  );

  useEffect(() => {
    if (!request || handledRequest.current === request) return;
    handledRequest.current = request;
    void start(request);
  }, [request, start]);

  async function startAll() {
    setStartingAll(true);
    for (const organization of organizations) await start(organization);
    setStartingAll(false);
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deletePlatformBackup(pendingDelete.id);
      showSuccess("Backup deleted");
      setPendingDelete(null);
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't delete the backup");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center" gap="300">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            Backups
          </Text>
          <Text as="p" tone="subdued">
            Company data as a ZIP. Uploaded files, videos and passwords aren&apos;t included. Download a copy and keep it
            somewhere private, away from the app.
          </Text>
        </BlockStack>
        <Button loading={startingAll} disabled={organizations.length === 0} onClick={() => void startAll()}>
          Back up all
        </Button>
      </InlineStack>
      {error ? <Banner tone="critical">{error}</Banner> : null}

      <IndexSurface>
        <IndexTable
          resourceName={{ singular: "backup", plural: "backups" }}
          itemCount={backups.length}
          loading={loading}
          headings={[
            { title: "Organization" },
            { title: "Created" },
            { title: "Status" },
            { title: "Contents" },
            { title: "Last downloaded" },
            { title: "Actions" },
          ]}
          selectable={false}
        >
          {backups.map((backup, index) => (
            <IndexTable.Row id={backup.id} key={backup.id} position={index}>
              <IndexTable.Cell>
                <Text as="span" fontWeight="semibold">
                  {backup.organizationName}
                </Text>
                {organizations.some((o) => o.id === backup.organizationId) ? null : (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Organization deleted
                  </Text>
                )}
              </IndexTable.Cell>
              <IndexTable.Cell>
                {formatAppDateTime(backup.createdAt)}
                <Text as="p" tone="subdued" variant="bodySm">
                  {backup.createdByEmail ?? "—"}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <StatusBadge status={backup.status} />
                {backup.error ? (
                  <Text as="p" tone="critical" variant="bodySm" breakWord>
                    {backup.error}
                  </Text>
                ) : null}
              </IndexTable.Cell>
              <IndexTable.Cell>
                {backup.status === "ready"
                  ? `${(backup.rowCount ?? 0).toLocaleString()} records · ${fileSize(backup.sizeBytes)}`
                  : "—"}
              </IndexTable.Cell>
              <IndexTable.Cell>
                {backup.lastDownloadedAt ? formatAppDateTime(backup.lastDownloadedAt) : "Never"}
                {backup.lastDownloadedByEmail ? (
                  <Text as="p" tone="subdued" variant="bodySm">
                    {backup.lastDownloadedByEmail}
                  </Text>
                ) : null}
              </IndexTable.Cell>
              <IndexTable.Cell>
                <InlineStack gap="200" wrap={false}>
                  {backup.status === "ready" ? (
                    <Button variant="plain" url={platformBackupDownloadUrl(backup.id)} download external>
                      Download
                    </Button>
                  ) : null}
                  {backup.status !== "running" ? (
                    <Button tone="critical" variant="plain" onClick={() => setPendingDelete(backup)}>
                      Delete
                    </Button>
                  ) : null}
                </InlineStack>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </IndexSurface>

      <Modal
        open={Boolean(pendingDelete)}
        title="Delete backup?"
        onClose={() => (deleting ? undefined : setPendingDelete(null))}
        primaryAction={{
          content: "Delete backup",
          destructive: true,
          loading: deleting,
          onAction: () => void handleDelete(),
        }}
        secondaryActions={[{ content: "Keep it", disabled: deleting, onAction: () => setPendingDelete(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            The stored backup of {pendingDelete?.organizationName} from{" "}
            {pendingDelete ? formatAppDateTime(pendingDelete.createdAt) : ""} will be removed. Copies you downloaded
            aren&apos;t affected.
          </Text>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
