"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  formatBytes,
  getStoredFiles,
  getStoredFolders,
  getVaultStats,
  moveFile,
  renameFile,
  renameFolder,
} from "@/lib/file-vault-api";
import type { FileCategory, VaultFile, VaultFolder, VaultStats } from "@/types/file-vault";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  Eye,
  FileCode,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  FolderPlus,
  Grid,
  HardDrive,
  Image as ImageIcon,
  List,
  MoveRight,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  Video,
  X,
} from "lucide-react";

/**
 * Big OS-Desktop Style Golden Folder SVG Component
 * Matches Windows 11 / macOS desktop directory folder aesthetic
 */
function BigFolderIcon({ className = "w-24 h-20" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 80"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Folder Back Tab */}
      <path
        d="M6 16C6 11.5817 9.58172 8 14 8H36C39.1171 8 41.9568 9.8136 43.2754 12.6457L46.8524 20.3232C47.2919 21.2662 48.2385 21.8708 49.2778 21.8708H86C90.4183 21.8708 94 25.4525 94 29.8708V68C94 72.4183 90.4183 76 86 76H14C9.58172 76 6 72.4183 6 68V16Z"
        fill="url(#folder_back_grad_big)"
      />
      {/* White Paper Sheet Insert */}
      <rect x="18" y="14" width="64" height="42" rx="3" fill="#FFFFFF" fillOpacity="0.95" />
      {/* Folder Front Cover */}
      <path
        d="M4 28C4 23.5817 7.58172 20 12 20H88C92.4183 20 96 23.5817 96 28V68C96 72.4183 92.4183 76 88 76H12C7.58172 76 4 72.4183 4 68V28Z"
        fill="url(#folder_front_grad_big)"
      />
      {/* Top Gloss Highlight */}
      <path
        d="M12 21H88C91.866 21 95 24.134 95 28V30C95 28.3431 93.6569 27 92 27H8C6.34315 27 5 28.3431 5 30V28C5 24.134 8.13401 21 12 21Z"
        fill="#FFFFFF"
        fillOpacity="0.4"
      />
      <defs>
        <linearGradient
          id="folder_back_grad_big"
          x1="50"
          y1="8"
          x2="50"
          y2="76"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F59E0B" />
          <stop offset="1" stopColor="#B45309" />
        </linearGradient>
        <linearGradient
          id="folder_front_grad_big"
          x1="50"
          y1="20"
          x2="50"
          y2="76"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FBBF24" />
          <stop offset="1" stopColor="#D97706" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function CompanyFileVault() {
  const { showSuccess } = useToast();

  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<FileCategory | "all">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Modals state
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTargetFolder, setUploadTargetFolder] = useState<string | null>(null);
  const [createNewFolderInUpload, setCreateNewFolderInUpload] = useState(false);
  const [inlineFolderName, setInlineFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [previewFile, setPreviewFile] = useState<VaultFile | null>(null);
  const [moveItem, setMoveItem] = useState<VaultFile | null>(null);
  const [targetMoveFolder, setTargetMoveFolder] = useState<string | null>(null);
  const [renameItem, setRenameItem] = useState<{ id: string; type: "file" | "folder"; name: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshData = useCallback(() => {
    setFolders(getStoredFolders());
    setFiles(getStoredFiles());
    setStats(getVaultStats());
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const currentFolder = folders.find((f) => f.id === currentFolderId);

  // Filtered lists
  const currentFoldersList = folders.filter((f) => {
    if (searchQuery.trim()) {
      return f.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return f.parentFolderId === currentFolderId;
  });

  const currentFilesList = files.filter((f) => {
    if (searchQuery.trim()) {
      const matchName = f.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = categoryFilter === "all" || f.category === categoryFilter;
      return matchName && matchCat;
    }
    const matchFolder = f.folderId === currentFolderId;
    const matchCat = categoryFilter === "all" || f.category === categoryFilter;
    return matchFolder && matchCat;
  });

  const openUploadModal = () => {
    setUploadTargetFolder(currentFolderId);
    setCreateNewFolderInUpload(false);
    setInlineFolderName("");
    setUploadOpen(true);
  };

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    createFolder(newFolderName.trim(), newFolderDesc.trim(), "amber", currentFolderId);
    showSuccess(`Created folder "${newFolderName.trim()}"`);
    setNewFolderName("");
    setNewFolderDesc("");
    setCreateFolderOpen(false);
    refreshData();
  };

  const handleFileUpload = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    let destinationFolderId = uploadTargetFolder;

    // Create inline folder if user requested inside upload modal
    if (createNewFolderInUpload && inlineFolderName.trim()) {
      const created = createFolder(inlineFolderName.trim(), undefined, "amber", currentFolderId);
      destinationFolderId = created.id;
    }

    setUploading(true);
    setUploadProgress(20);

    const timer = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(timer);
          return 90;
        }
        return prev + 25;
      });
    }, 200);

    setTimeout(() => {
      clearInterval(timer);
      setUploadProgress(100);

      Array.from(fileList).forEach((file) => {
        let objectUrl = "";
        try {
          objectUrl = URL.createObjectURL(file);
        } catch (e) {
          objectUrl = "";
        }

        createFile(
          file.name,
          file.size,
          file.type || "application/octet-stream",
          destinationFolderId,
          objectUrl,
          "Admin User",
        );
      });

      setUploading(false);
      setUploadOpen(false);
      setUploadProgress(0);
      showSuccess(`Successfully uploaded ${fileList.length} file(s)`);
      refreshData();
    }, 1000);
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    showSuccess("Cloud file link copied to clipboard");
  };

  const handleDeleteFile = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete file "${name}"?`)) {
      deleteFile(id);
      showSuccess(`Deleted file "${name}"`);
      refreshData();
    }
  };

  const handleDeleteFolder = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete folder "${name}" and all its contents?`)) {
      deleteFolder(id);
      showSuccess(`Deleted folder "${name}"`);
      if (currentFolderId === id) setCurrentFolderId(null);
      refreshData();
    }
  };

  const handleMoveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveItem) return;
    moveFile(moveItem.id, targetMoveFolder);
    showSuccess(`Moved "${moveItem.name}" to target directory`);
    setMoveItem(null);
    refreshData();
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameItem || !renameItem.name.trim()) return;

    if (renameItem.type === "file") {
      renameFile(renameItem.id, renameItem.name.trim());
      showSuccess(`Renamed to "${renameItem.name.trim()}"`);
    } else {
      renameFolder(renameItem.id, renameItem.name.trim());
      showSuccess(`Renamed to "${renameItem.name.trim()}"`);
    }
    setRenameItem(null);
    refreshData();
  };

  const getCategoryIcon = (category: FileCategory, mimeType?: string) => {
    switch (category) {
      case "video":
        return <Video className="h-5 w-5 text-purple-500" />;
      case "image":
        return <ImageIcon className="h-5 w-5 text-amber-500" />;
      case "spreadsheet":
        return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
      case "archive":
        return <FileCode className="h-5 w-5 text-rose-500" />;
      default:
        return <FileText className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Storage Header Analytics Banner */}
      <div className="p-6 rounded-2xl border bg-gradient-to-r from-card via-muted/20 to-card shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0 shadow-2xs">
              <Folder className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-black text-foreground tracking-tight">
                  Enterprise Cloud Document Storage
                </h3>
                <StatusBadge variant="success" className="text-[10px] font-bold">
                  Cloud Vault Active
                </StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                Store, organize, and stream company agreements, ROV inspection videos, and documents.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <Button size="sm" variant="outline" onClick={() => setCreateFolderOpen(true)}>
              <FolderPlus className="h-4 w-4 mr-1.5" /> New Folder
            </Button>
            <Button size="sm" onClick={openUploadModal}>
              <UploadCloud className="h-4 w-4 mr-1.5" /> Upload File
            </Button>
          </div>
        </div>

        {/* Storage Capacity & Upload Limit Bar */}
        {stats && (
          <div className="pt-2 border-t border-border/50 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-amber-500" /> Current Used Space
                </span>
                <span className="text-foreground font-bold text-sm">
                  {formatBytes(stats.totalUsedBytes)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg border border-border/40">
                <span className="font-medium">File Upload Limit:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded text-[11px]">
                  500 MB per file
                </span>
              </div>
            </div>

            <div className="flex items-center justify-around md:col-span-2 pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-border/50 text-center">
              <div>
                <div className="text-lg font-bold text-foreground">{stats.totalFolders}</div>
                <div className="text-[11px] text-muted-foreground font-medium">Folders</div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{stats.totalFiles}</div>
                <div className="text-[11px] text-muted-foreground font-medium">Total Files</div>
              </div>
              <div>
                <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{stats.videosCount}</div>
                <div className="text-[11px] text-muted-foreground font-medium">Videos</div>
              </div>
              <div>
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.documentsCount}</div>
                <div className="text-[11px] text-muted-foreground font-medium">Docs</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar: Breadcrumbs, Search, View Switcher */}
      <div className="p-4 rounded-xl border bg-card shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          {/* Back Arrow Button & Breadcrumb Path */}
          <div className="flex items-center gap-2">
            {currentFolderId !== null && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 font-bold text-xs hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 border-amber-500/30 transition-colors shrink-0"
                onClick={() => {
                  const parentId = currentFolder?.parentFolderId || null;
                  setCurrentFolderId(parentId);
                }}
                title="Go Back"
              >
                <ArrowLeft className="h-4 w-4 mr-1 text-amber-500" /> Back
              </Button>
            )}

            <div className="flex items-center gap-1.5 text-xs font-semibold overflow-x-auto scrollbar-none py-1">
              <button
                type="button"
                className={`hover:text-primary transition-colors flex items-center gap-1 ${
                  currentFolderId === null ? "text-foreground font-extrabold" : "text-muted-foreground"
                }`}
                onClick={() => setCurrentFolderId(null)}
              >
                <Folder className="h-3.5 w-3.5 text-amber-500" /> Root Vault
              </button>
              {currentFolder && (
                <>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground font-extrabold truncate max-w-[200px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/20">
                    {currentFolder.name}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Search & Category Filter & View Mode */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-60">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search files & folders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium focus:outline-none"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
            >
              <option value="all">All File Types</option>
              <option value="video">Videos & Media (.mp4)</option>
              <option value="document">Documents & PDFs</option>
              <option value="spreadsheet">Spreadsheets (.xlsx)</option>
              <option value="image">Images (.png, .jpg)</option>
            </select>

            {/* Functional Grid vs List View Switcher */}
            <div className="flex items-center border rounded-lg p-0.5 bg-muted/30">
              <button
                type="button"
                className={`p-1 rounded transition-colors ${
                  viewMode === "grid" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground"
                }`}
                title="Grid View Cards"
                onClick={() => setViewMode("grid")}
              >
                <Grid className="h-4 w-4" />
                <span className="sr-only">Grid View</span>
              </button>
              <button
                type="button"
                className={`p-1 rounded transition-colors ${
                  viewMode === "list" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground"
                }`}
                title="List View Table"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
                <span className="sr-only">List View</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Folders Section - Only show when at Root Vault with no folders OR when folders exist */}
      {(currentFoldersList.length > 0 || currentFolderId === null) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Folder className="h-3.5 w-3.5 text-amber-500" /> Folders ({currentFoldersList.length})
            </span>
            <Button size="xs" variant="outline" onClick={() => setCreateFolderOpen(true)}>
              <FolderPlus className="h-3.5 w-3.5 mr-1" /> New Folder
            </Button>
          </div>

          {currentFoldersList.length === 0 && currentFolderId === null ? (
            <div className="p-8 border border-dashed rounded-2xl bg-muted/10 text-center space-y-3">
              <BigFolderIcon className="w-20 h-16 mx-auto opacity-70" />
              <div>
                <p className="text-sm font-bold text-foreground">No folders created yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                  Create a folder to organize your company contracts, ROV inspection videos, and media assets.
                </p>
              </div>
              <Button size="sm" onClick={() => setCreateFolderOpen(true)}>
                <FolderPlus className="h-4 w-4 mr-1.5" /> Create First Folder
              </Button>
            </div>
          ) : currentFoldersList.length > 0 ? (
            viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {currentFoldersList.map((folder) => {
                  const fileCount = files.filter((f) => f.folderId === folder.id).length;

                  return (
                    <div
                      key={folder.id}
                      className="group relative p-5 rounded-2xl border border-border/80 bg-card hover:bg-muted/20 hover:border-amber-500/60 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col items-center text-center space-y-3"
                      onClick={() => setCurrentFolderId(folder.id)}
                    >
                      {/* Top Action Controls */}
                      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                          title="Rename Folder"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameItem({ id: folder.id, type: "folder", name: folder.name });
                          }}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete Folder"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFolder(folder.id, folder.name);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Prominent OS Desktop Big Golden Folder Icon */}
                      <div className="pt-2">
                        <BigFolderIcon className="w-24 h-20 transition-transform duration-200 group-hover:scale-105 drop-shadow-md" />
                      </div>

                      {/* Folder Label & Details */}
                      <div className="w-full px-1">
                        <h4 className="font-extrabold text-sm text-foreground group-hover:text-amber-500 transition-colors line-clamp-1">
                          {folder.name}
                        </h4>
                        {folder.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 font-medium">
                            {folder.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-1 w-full border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="px-2 py-0.5 rounded-md bg-muted font-bold text-[11px]">
                          {fileCount} file{fileCount !== 1 ? "s" : ""}
                        </span>
                        <span className="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 flex items-center group-hover:translate-x-0.5 transition-transform">
                          Open <ChevronRight className="h-3 w-3 ml-0.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Folders Table List View */
              <div className="rounded-xl border bg-card overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b text-muted-foreground font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Folder Name</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Contents</th>
                      <th className="py-3 px-4">Created Date</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {currentFoldersList.map((folder) => {
                      const fileCount = files.filter((f) => f.folderId === folder.id).length;

                      return (
                        <tr
                          key={folder.id}
                          className="hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => setCurrentFolderId(folder.id)}
                        >
                          <td className="py-3 px-4 font-extrabold text-foreground flex items-center gap-2">
                            <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                            <span className="hover:text-amber-500 transition-colors truncate max-w-[250px]">
                              {folder.name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground truncate max-w-[200px]">
                            {folder.description || "—"}
                          </td>
                          <td className="py-3 px-4 font-bold text-foreground">
                            {fileCount} file{fileCount !== 1 ? "s" : ""}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {new Date(folder.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button size="xs" variant="ghost" onClick={() => setCurrentFolderId(folder.id)}>
                                Open
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => setRenameItem({ id: folder.id, type: "folder", name: folder.name })}
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteFolder(folder.id, folder.name)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      )}

      {/* Files Section - Main View when Inside a Folder */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" /> Files ({currentFilesList.length})
          </span>
          {currentFolder ? (
            <span className="text-xs font-semibold text-muted-foreground font-normal flex items-center gap-2">
              <span>Inside <strong className="text-amber-500 font-bold">{currentFolder.name}</strong></span>
              <Button size="xs" variant="outline" onClick={() => setCreateFolderOpen(true)}>
                <FolderPlus className="h-3 w-3 mr-1" /> New Subfolder
              </Button>
            </span>
          ) : null}
        </div>

        {currentFilesList.length === 0 ? (
          <div className="text-center py-14 border border-dashed rounded-2xl bg-muted/20 space-y-3">
            <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">No files in this location</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                Upload documents, PDFs, spreadsheet reports, or inspection videos into a selected folder.
              </p>
            </div>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentFilesList.map((file) => (
              <div
                key={file.id}
                className="group relative p-4 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl border bg-muted/30 shrink-0">
                      {getCategoryIcon(file.category, file.mimeType)}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-foreground line-clamp-1 break-all group-hover:text-primary transition-colors">
                        {file.name}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium">{formatBytes(file.sizeBytes)}</span>
                        <span>•</span>
                        <span className="uppercase text-[10px] font-bold text-primary px-1.5 py-0.2 rounded bg-primary/10 border border-primary/20">
                          {file.category}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="p-1 rounded text-muted-foreground hover:text-foreground"
                    onClick={() => setPreviewFile(file)}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>

                {/* Video Player Preview thumbnail if Video */}
                {file.category === "video" && (
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-black/80 border flex items-center justify-center group/video cursor-pointer" onClick={() => setPreviewFile(file)}>
                    <Film className="h-8 w-8 text-purple-400 group-hover/video:scale-110 transition-transform" />
                    <span className="absolute bottom-2 right-2 text-[10px] font-bold bg-black/70 text-white px-2 py-0.5 rounded">
                      Video Stream
                    </span>
                  </div>
                )}

                {/* Action Toolbar */}
                <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                  <span className="text-[11px] text-muted-foreground truncate">
                    By {file.uploadedBy}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                      title="Copy Share Link"
                      onClick={() => handleCopyUrl(file.url)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                      title="Move File"
                      onClick={() => setMoveItem(file)}
                    >
                      <MoveRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Delete File"
                      onClick={() => handleDeleteFile(file.id, file.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View Table */
          <div className="rounded-xl border bg-card overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b text-muted-foreground font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Uploaded By</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {currentFilesList.map((file) => (
                  <tr key={file.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 font-bold text-foreground flex items-center gap-2">
                      {getCategoryIcon(file.category, file.mimeType)}
                      <span
                        className="hover:text-primary cursor-pointer truncate max-w-[280px]"
                        onClick={() => setPreviewFile(file)}
                      >
                        {file.name}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-muted border">
                        {file.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-muted-foreground">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{file.uploadedBy}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {new Date(file.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="xs" variant="ghost" onClick={() => setPreviewFile(file)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => handleCopyUrl(file.url)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setMoveItem(file)}>
                          <MoveRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteFile(file.id, file.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Create Folder */}
      {createFolderOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setCreateFolderOpen(false)} />
          <div className="relative w-full max-w-md bg-card border rounded-2xl p-6 shadow-2xl space-y-4 z-10 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <FolderPlus className="h-5 w-5 text-amber-500" /> Create New Folder
              </h3>
              <button type="button" onClick={() => setCreateFolderOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Folder Name <span className="text-destructive">*</span>
                </label>
                <Input
                  required
                  placeholder="e.g. ROV Inspection Videos, Legal Contracts"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">Description</label>
                <Input
                  placeholder="Brief summary of contents..."
                  value={newFolderDesc}
                  onChange={(e) => setNewFolderDesc(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setCreateFolderOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Create Folder
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Upload Files with Target Folder Selector */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setUploadOpen(false)} />
          <div className="relative w-full max-w-lg bg-card border rounded-2xl p-6 shadow-2xl space-y-4 z-10 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-amber-500" /> Upload Files to Storage
              </h3>
              <button type="button" onClick={() => setUploadOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Folder Selection for Upload */}
            <div className="space-y-3 bg-muted/20 p-4 rounded-xl border border-border/50">
              <label className="block text-xs font-bold text-foreground">
                Select Destination Folder <span className="text-destructive">*</span>
              </label>

              {!createNewFolderInUpload ? (
                <div className="space-y-2">
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs font-medium focus:outline-none"
                    value={uploadTargetFolder || "root"}
                    onChange={(e) => {
                      if (e.target.value === "__NEW_FOLDER__") {
                        setCreateNewFolderInUpload(true);
                      } else {
                        setUploadTargetFolder(e.target.value === "root" ? null : e.target.value);
                      }
                    }}
                  >
                    <option value="root">Root Vault (Main Directory)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name}
                      </option>
                    ))}
                    <option value="__NEW_FOLDER__">+ Create New Folder for Upload...</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-600 dark:text-amber-400">Create New Folder for this upload:</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground underline text-[11px]"
                      onClick={() => setCreateNewFolderInUpload(false)}
                    >
                      Choose existing folder
                    </button>
                  </div>
                  <Input
                    required
                    placeholder="Enter new folder name (e.g. Subsea ROV Audits)"
                    value={inlineFolderName}
                    onChange={(e) => setInlineFolderName(e.target.value)}
                  />
                </div>
              )}
            </div>

            <input
              type="file"
              multiple
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />

            <div
              className="border-2 border-dashed border-amber-500/40 hover:border-amber-500 rounded-2xl p-8 text-center space-y-3 bg-amber-500/5 hover:bg-amber-500/10 transition-colors cursor-pointer"
              onClick={() => {
                if (createNewFolderInUpload && !inlineFolderName.trim()) {
                  alert("Please enter a name for your new folder first.");
                  return;
                }
                fileInputRef.current?.click();
              }}
            >
              <div className="size-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Click to browse or drag & drop files here</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports MP4, MOV, PDFs, DOCX, XLSX, PNG, JPG (Up to 500 MB per file)
                </p>
              </div>
            </div>

            {uploading && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs font-semibold text-foreground">
                  <span>Uploading to folder...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: File Preview */}
      {previewFile && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={() => setPreviewFile(null)} />
          <div className="relative w-full max-w-3xl bg-card border rounded-2xl p-6 shadow-2xl space-y-4 z-10 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div className="flex items-center gap-2">
                {getCategoryIcon(previewFile.category, previewFile.mimeType)}
                <div>
                  <h3 className="text-base font-bold text-foreground line-clamp-1">{previewFile.name}</h3>
                  <p className="text-xs text-muted-foreground">{formatBytes(previewFile.sizeBytes)} • {previewFile.mimeType}</p>
                </div>
              </div>
              <button type="button" onClick={() => setPreviewFile(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Media Content Preview */}
            <div className="flex-1 overflow-y-auto min-h-[250px] bg-black/90 rounded-xl border flex items-center justify-center p-4">
              {previewFile.category === "video" ? (
                <video
                  controls
                  autoPlay
                  className="max-h-[400px] w-full rounded-lg"
                  src={previewFile.url}
                  onError={(e) => {
                    (e.target as HTMLVideoElement).src =
                      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
                  }}
                >
                  Your browser does not support HTML5 video playback.
                </video>
              ) : previewFile.category === "image" ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-h-[400px] object-contain rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=80";
                  }}
                />
              ) : (
                <div className="text-center p-8 text-white space-y-3">
                  <FileText className="h-16 w-16 text-primary mx-auto" />
                  <div>
                    <p className="font-bold text-base">{previewFile.name}</p>
                    <p className="text-xs text-slate-300 mt-1">
                      Enterprise document stored in Cloud Storage Vault
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-between pt-2 shrink-0 border-t">
              <span className="text-xs text-muted-foreground">Uploaded by {previewFile.uploadedBy}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => handleCopyUrl(previewFile.url)}>
                  <Copy className="h-4 w-4 mr-1.5" /> Copy Share Link
                </Button>
                <Button size="sm" onClick={() => window.open(previewFile.url, "_blank")}>
                  <Download className="h-4 w-4 mr-1.5" /> Open / Download
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Move File */}
      {moveItem && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMoveItem(null)} />
          <div className="relative w-full max-w-md bg-card border rounded-2xl p-6 shadow-2xl space-y-4 z-10 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <MoveRight className="h-5 w-5 text-primary" /> Move File
              </h3>
              <button type="button" onClick={() => setMoveItem(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleMoveSubmit} className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Select destination directory for <strong className="text-foreground">{moveItem.name}</strong>:
                </p>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs font-medium focus:outline-none"
                  value={targetMoveFolder || "root"}
                  onChange={(e) => setTargetMoveFolder(e.target.value === "root" ? null : e.target.value)}
                >
                  <option value="root">Root Vault (Main Directory)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setMoveItem(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Move File
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Rename File or Folder */}
      {renameItem && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setRenameItem(null)} />
          <div className="relative w-full max-w-md bg-card border rounded-2xl p-6 shadow-2xl space-y-4 z-10 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-foreground">
                Rename {renameItem.type === "file" ? "File" : "Folder"}
              </h3>
              <button type="button" onClick={() => setRenameItem(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">New Name</label>
                <Input
                  required
                  value={renameItem.name}
                  onChange={(e) => setRenameItem({ ...renameItem, name: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setRenameItem(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
