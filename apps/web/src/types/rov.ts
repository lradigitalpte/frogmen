export type RovProjectStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "archived";

export type InspectionSeverity = "major" | "moderate" | "minor";
export type InspectionViewType = "rov" | "diver";
export type InspectionMediaType = "video" | "image" | "document";
export type InspectionReportStatus = "draft" | "final" | "shared" | "archived";

export interface RovProject {
  id: string;
  organizationId: string;
  branchId: string;
  name: string;
  description: string | null;
  location: string | null;
  latitude: string | null;
  longitude: string | null;
  planViewPath: string | null;
  siteMapPath: string | null;
  status: RovProjectStatus;
  startDate: string | null;
  endDate: string | null;
  customerId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  customerName?: string | null;
  creatorName?: string | null;
  structureCount?: number;
  structures?: ProjectStructure[];
}

export interface ProjectStructure {
  id: string;
  rovProjectId: string;
  name: string;
  description: string | null;
  diagramPath: string | null;
  photoPath: string | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionView {
  id: string;
  structureId: string;
  name: string;
  viewType: InspectionViewType;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionPoint {
  id: string;
  inspectionViewId: string;
  observationId: string | null;
  pointNumber: number | null;
  label: string | null;
  xCoordinate: number | null;
  yCoordinate: number | null;
  severity: InspectionSeverity | null;
  findingType: string | null;
  description: string | null;
  diveLocation: string | null;
  depthM: string | null;
  dimensionMm: string | null;
  recommendations: string | null;
  createdAt: string;
  updatedAt: string;
  media?: InspectionMedia[];
  viewName?: string;
  viewType?: InspectionViewType;
  structureId?: string;
  structureName?: string;
}

export interface InspectionMedia {
  id: string;
  structureId: string;
  inspectionPointId: string | null;
  mediaType: InspectionMediaType;
  fileName: string;
  filePath: string;
  thumbnailPath: string | null;
  mimeType: string | null;
  fileSize: number | null;
  duration: number | null;
  uploadedBy: string | null;
  uploadedAt: string;
  url?: string | null;
  thumbnailUrl?: string | null;
  structureName?: string | null;
  uploaderName?: string | null;
}

export interface InspectionReport {
  id: string;
  organizationId: string;
  rovProjectId: string;
  title: string | null;
  summary: string | null;
  fullReport: string | null;
  conclusions: string | null;
  recommendations: string | null;
  status: InspectionReportStatus;
  sharedLinkHash: string | null;
  sharedLinkExpiresAt: string | null;
  clientCanDownload: boolean;
  clientCanPrint: boolean;
  sharedDate: string | null;
  sharedBy: string | null;
  createdAt: string;
  updatedAt: string;
  projectName?: string;
}

export interface PaginatedRovProjects {
  data: RovProject[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateRovProjectInput {
  name: string;
  description?: string;
  location?: string;
  latitude?: string;
  longitude?: string;
  status?: RovProjectStatus;
  startDate?: string;
  endDate?: string;
  customerId?: string | null;
}

export interface CreateStructureInput {
  name: string;
  description?: string;
  sort?: number;
  diagramPath?: string;
  photoPath?: string;
}

export interface CreateMediaInput {
  structureId: string;
  inspectionPointId?: string | null;
  mediaType: InspectionMediaType;
  fileName: string;
  filePath: string;
  mimeType?: string;
  fileSize?: number;
  duration?: number;
}

export interface CreateReportInput {
  title?: string;
  summary?: string;
  fullReport?: string;
  conclusions?: string;
  recommendations?: string;
  status?: InspectionReportStatus;
  clientCanDownload?: boolean;
  clientCanPrint?: boolean;
}

export interface PublicReportPayload {
  report: {
    id: string;
    title: string | null;
    summary: string | null;
    fullReport: string | null;
    conclusions: string | null;
    recommendations: string | null;
    status: string;
    sharedDate: string | null;
    expiresAt: string | null;
    clientCanDownload: boolean;
    clientCanPrint: boolean;
  };
  project: {
    id: string;
    name: string;
    location: string | null;
    latitude: string | null;
    longitude: string | null;
    startDate: string | null;
    endDate: string | null;
    planViewUrl: string | null;
    siteMapUrl: string | null;
    customer: { name: string } | null;
    structures: Array<{
      id: string;
      name: string;
      description: string | null;
      photoUrl: string | null;
      diagramUrl: string | null;
      views: Array<{
        id: string;
        name: string;
        viewType: string;
        points: Array<InspectionPoint & { media: InspectionMedia[] }>;
      }>;
      unlinkedMedia: InspectionMedia[];
    }>;
  } | null;
  severityCounts: { major: number; moderate: number; minor: number };
}
