import type { FileCategory, VaultFile, VaultFolder, VaultStats } from "@/types/file-vault";

const STORAGE_FOLDERS_KEY = "frogmen_vault_folders_v3";
const STORAGE_FILES_KEY = "frogmen_vault_files_v3";

const INITIAL_FOLDERS: VaultFolder[] = [];
const INITIAL_FILES: VaultFile[] = [];

export function getStoredFolders(): VaultFolder[] {
  if (typeof window === "undefined") return INITIAL_FOLDERS;
  try {
    const item = localStorage.getItem(STORAGE_FOLDERS_KEY);
    if (!item) {
      localStorage.setItem(STORAGE_FOLDERS_KEY, JSON.stringify(INITIAL_FOLDERS));
      return INITIAL_FOLDERS;
    }
    return JSON.parse(item);
  } catch (e) {
    console.error("Failed to read stored vault folders:", e);
    return INITIAL_FOLDERS;
  }
}

export function saveStoredFolders(folders: VaultFolder[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_FOLDERS_KEY, JSON.stringify(folders));
  } catch (e) {
    console.error("Failed to save vault folders:", e);
  }
}

export function getStoredFiles(): VaultFile[] {
  if (typeof window === "undefined") return INITIAL_FILES;
  try {
    const item = localStorage.getItem(STORAGE_FILES_KEY);
    if (!item) {
      localStorage.setItem(STORAGE_FILES_KEY, JSON.stringify(INITIAL_FILES));
      return INITIAL_FILES;
    }
    return JSON.parse(item);
  } catch (e) {
    console.error("Failed to read stored vault files:", e);
    return INITIAL_FILES;
  }
}

export function saveStoredFiles(files: VaultFile[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_FILES_KEY, JSON.stringify(files));
  } catch (e) {
    console.error("Failed to save vault files:", e);
  }
}

export function getVaultStats(): VaultStats {
  const folders = getStoredFolders();
  const files = getStoredFiles();

  const totalUsedBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);
  const totalFiles = files.length;
  const totalFolders = folders.length;

  const documentsCount = files.filter((f) => f.category === "document").length;
  const videosCount = files.filter((f) => f.category === "video").length;
  const imagesCount = files.filter((f) => f.category === "image").length;
  const spreadsheetsCount = files.filter((f) => f.category === "spreadsheet").length;

  return {
    totalUsedBytes,
    totalFiles,
    totalFolders,
    documentsCount,
    videosCount,
    imagesCount,
    spreadsheetsCount,
  };
}

export function createFolder(
  name: string,
  description?: string,
  color?: string,
  parentFolderId: string | null = null,
): VaultFolder {
  const folders = getStoredFolders();
  const now = new Date().toISOString();
  const newFolder: VaultFolder = {
    id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name,
    description: description || undefined,
    color: color || "amber",
    parentFolderId,
    createdAt: now,
    updatedAt: now,
  };

  const updated = [newFolder, ...folders];
  saveStoredFolders(updated);
  return newFolder;
}

export function renameFolder(id: string, name: string, description?: string): VaultFolder | null {
  const folders = getStoredFolders();
  const index = folders.findIndex((f) => f.id === id);
  if (index === -1) return null;

  folders[index] = {
    ...folders[index],
    name,
    description: description !== undefined ? description : folders[index].description,
    updatedAt: new Date().toISOString(),
  };

  saveStoredFolders(folders);
  return folders[index];
}

export function deleteFolder(id: string): boolean {
  const folders = getStoredFolders();
  const files = getStoredFiles();

  const filteredFolders = folders.filter((f) => f.id !== id && f.parentFolderId !== id);
  const filteredFiles = files.filter((f) => f.folderId !== id);

  saveStoredFolders(filteredFolders);
  saveStoredFiles(filteredFiles);
  return true;
}

export function createFile(
  name: string,
  sizeBytes: number,
  mimeType: string,
  folderId: string | null = null,
  fileUrl?: string,
  uploadedBy = "Admin",
): VaultFile {
  const files = getStoredFiles();
  const now = new Date().toISOString();

  let category: FileCategory = "document";
  if (mimeType.startsWith("video/")) category = "video";
  else if (mimeType.startsWith("image/")) category = "image";
  else if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv")) category = "spreadsheet";
  else if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("rar")) category = "archive";

  let defaultWorkingUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
  if (category === "video") {
    defaultWorkingUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
  } else if (category === "image") {
    defaultWorkingUrl = "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=80";
  }

  const newFile: VaultFile = {
    id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name,
    sizeBytes,
    mimeType,
    category,
    url: fileUrl || defaultWorkingUrl,
    folderId,
    uploadedBy,
    createdAt: now,
    updatedAt: now,
  };

  const updated = [newFile, ...files];
  saveStoredFiles(updated);
  return newFile;
}

export function renameFile(id: string, newName: string): VaultFile | null {
  const files = getStoredFiles();
  const index = files.findIndex((f) => f.id === id);
  if (index === -1) return null;

  files[index] = {
    ...files[index],
    name: newName,
    updatedAt: new Date().toISOString(),
  };

  saveStoredFiles(files);
  return files[index];
}

export function moveFile(id: string, targetFolderId: string | null): VaultFile | null {
  const files = getStoredFiles();
  const index = files.findIndex((f) => f.id === id);
  if (index === -1) return null;

  files[index] = {
    ...files[index],
    folderId: targetFolderId,
    updatedAt: new Date().toISOString(),
  };

  saveStoredFiles(files);
  return files[index];
}

export function deleteFile(id: string): boolean {
  const files = getStoredFiles();
  const filtered = files.filter((f) => f.id !== id);
  saveStoredFiles(filtered);
  return true;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
