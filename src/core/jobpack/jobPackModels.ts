import type { EngineeringAssetSnapshot, EngineeringAreaId, EngineeringUserId } from '../engineering/engineeringTypes';
import type { JobPackDocumentModel, JobPackRiskLevel, JobPackStatus } from '../engineering/jobPackTypes';

export type BuildPartnerJobPackSectionKey =
  | 'cover'
  | 'scope'
  | 'revision_register'
  | 'construction_notes'
  | 'health_safety'
  | 'asset_schedule'
  | 'pole_schedule'
  | 'chamber_schedule'
  | 'joint_schedule'
  | 'dp_schedule'
  | 'cable_schedule'
  | 'fas'
  | 'qa_checklist'
  | 'risk_register'
  | 'material_schedule'
  | 'traffic_management'
  | 'photo_manifest'
  | 'sign_off';

export type JobPackExportFileType = 'html' | 'csv' | 'json' | 'md' | 'txt';

export interface JobPackExportFile {
  path: string;
  fileType: JobPackExportFileType;
  mimeType: string;
  content: string;
}

export interface BuildPartnerJobPackAssetRecord {
  id: string;
  name: string;
  type: string;
  status: string;
  location: string;
  geometryType: string;
  routeLengthMeters?: number;
  fibreCount?: string;
  cableType?: string;
  installMethod?: string;
  upstreamAsset?: string;
  downstreamAsset?: string;
  linkedDp?: string;
  photoCount: number;
  notes?: string;
  raw: EngineeringAssetSnapshot;
}

export interface BuildPartnerJobPackIssue {
  id: string;
  level: JobPackRiskLevel;
  category: string;
  assetId?: string;
  assetName?: string;
  message: string;
  requiredAction: string;
}

export interface BuildPartnerJobPackSection {
  key: BuildPartnerJobPackSectionKey;
  title: string;
  lines: string[];
  fileName: string;
}

export interface BuildPartnerJobPackSummary {
  totalAssets: number;
  poles: number;
  chambers: number;
  joints: number;
  dps: number;
  cables: number;
  homes: number;
  areas: number;
  overheadRoutes: number;
  undergroundRoutes: number;
  routeLengthMeters: number;
  warnings: number;
  blockers: number;
  photos: number;
}

export interface BuildPartnerJobPackInput {
  areaId: EngineeringAreaId;
  areaName?: string;
  revisionNumber?: string;
  reason?: string;
  generatedBy?: EngineeringUserId;
  affectedAssets?: string[];
  assets: EngineeringAssetSnapshot[];
  status?: JobPackStatus;
}

export interface BuildPartnerJobPackResult extends JobPackDocumentModel {
  buildPartnerSummary: BuildPartnerJobPackSummary;
  buildPartnerSections: BuildPartnerJobPackSection[];
  issueRegister: BuildPartnerJobPackIssue[];
  exportFiles: JobPackExportFile[];
}
