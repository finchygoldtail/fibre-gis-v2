import {
  EngineeringDocumentType,
} from './engineeringTypes';
import type {
  EngineeringAreaId,
  EngineeringAssetSnapshot,
  EngineeringUserId,
} from './engineeringTypes';

export type JobPackStatus =
  | 'draft'
  | 'ready_for_review'
  | 'approved'
  | 'issued_to_build_partner'
  | 'superseded'
  | 'cancelled';

export type JobPackSectionType =
  | 'overview'
  | 'asset_register'
  | 'work_instructions'
  | 'fas_summary'
  | 'as_built_summary'
  | 'quality_checks'
  | 'commercial_checks'
  | 'handover';

export type JobPackRiskLevel = 'info' | 'warning' | 'blocker';

export interface JobPackAssetRecord {
  id: string;
  name: string;
  type: string;
  status?: string;
  installMethod?: string;
  fibreCount?: string;
  cableType?: string;
  geometrySummary: string;
  workInstruction: string;
  validationNotes: string[];
  sourceAsset: EngineeringAssetSnapshot;
}

export interface JobPackRisk {
  id: string;
  level: JobPackRiskLevel;
  title: string;
  message: string;
  assetId?: string;
  assetName?: string;
  recommendedAction: string;
}

export interface JobPackSection {
  id: string;
  type: JobPackSectionType;
  title: string;
  lines: string[];
}

export interface JobPackSummary {
  totalAssets: number;
  poles: number;
  chambers: number;
  distributionPoints: number;
  joints: number;
  cables: number;
  homes: number;
  areas: number;
  overheadCables: number;
  undergroundCables: number;
  warnings: number;
  blockers: number;
}

export interface JobPackExportFile {
  path: string;
  fileType?: string;
  mimeType: string;
  content: string;
}

export interface JobPackDocumentModel {
  id: string;
  areaId: EngineeringAreaId;
  areaName?: string;
  jobPackNumber: string;
  revisionNumber?: string;
  status: JobPackStatus;
  generatedAt: string;
  generatedBy?: EngineeringUserId;
  issuedAt?: string;
  issuedBy?: EngineeringUserId;
  reason: string;
  documentTypes: EngineeringDocumentType[];
  affectedAssets: string[];
  assets: JobPackAssetRecord[];
  risks: JobPackRisk[];
  sections: JobPackSection[];
  summary: JobPackSummary;

  /**
   * Optional generated files used by the Phase 15C Build Partner Job Pack generator.
   * Kept optional so older locally cached Job Packs remain compatible.
   */
  exportFiles?: JobPackExportFile[];
}

export interface BuildJobPackInput {
  areaId: EngineeringAreaId;
  areaName?: string;
  revisionNumber?: string;
  reason?: string;
  generatedBy?: EngineeringUserId;
  affectedAssets?: string[];
  assets: EngineeringAssetSnapshot[];
}
