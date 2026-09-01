import { apiFetch } from "./api";
import type {
  CreateVaultFolderInput,
  FileCategory,
  UpdateVaultFileInput,
  UpdateVaultFolderInput,
  VaultFile,
  VaultFolder,
  VaultOverviewResponse,
  VaultStats,
} from "@frog1/shared";

export type {
  CreateVaultFolderInput,
  FileCategory,
  UpdateVaultFileInput,
  UpdateVaultFolderInput,
  VaultFile,
  VaultFolder,
  VaultOverviewResponse,
  VaultStats,
};

export async function getVaultOverview(): Promise<VaultOverviewResponse> {
  return apiFetch<VaultOverviewResponse>("/api/v1/settings/vault/overview");
}

export async function createFolder(
  input: CreateVaultFolderInput,
): Promise<VaultFolder> {
  return apiFetch<VaultFolder>("/api/v1/settings/vault/folders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function renameFolder(
  id: string,
  name: string,
  description?: string,
): Promise<VaultFolder> {
  return apiFetch<VaultFolder>(`/api/v1/settings/vault/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteFolder(id: string): Promise<boolean> {
  await apiFetch(`/api/v1/settings/vault/folders/${id}`, {
    method: "DELETE",
  });
  return true;
}

export async function uploadVaultFile(
  file: File,
  folderId?: string | null,
): Promise<VaultFile> {
  const formData = new FormData();
  formData.append("file", file);
  if (folderId) {
    formData.append("folderId", folderId);
  }

  const response = await fetch("/api/v1/settings/vault/upload", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      typeof body?.message === "string"
        ? body.message
        : response.statusText || "Failed to upload file to Cloud Vault";
    throw new Error(message);
  }

  return response.json() as Promise<VaultFile>;
}

export async function renameFile(
  id: string,
  newName: string,
): Promise<VaultFile> {
  return apiFetch<VaultFile>(`/api/v1/settings/vault/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: newName }),
  });
}

export async function moveFile(
  id: string,
  targetFolderId: string | null,
): Promise<VaultFile> {
  return apiFetch<VaultFile>(`/api/v1/settings/vault/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ folderId: targetFolderId }),
  });
}

export async function deleteFile(id: string): Promise<boolean> {
  await apiFetch(`/api/v1/settings/vault/files/${id}`, {
    method: "DELETE",
  });
  return true;
}

export async function getVaultFileDownloadUrl(id: string): Promise<string> {
  const res = await apiFetch<{ url: string }>(
    `/api/v1/settings/vault/files/${id}/download`,
  );
  return res.url;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
