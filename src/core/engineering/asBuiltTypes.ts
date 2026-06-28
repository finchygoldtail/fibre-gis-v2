import {
  EngineeringDocumentType,
} from './engineeringTypes';
import type {
  EngineeringAreaId,
  EngineeringAssetSnapshot,
  EngineeringUserId,
} from './engineeringTypes';

export enum AsBuiltAssetStatus {
  Existing = 'existing',
  New = 'new',
  Modified = 'modified',
  Removed = 'removed',
  Unknown = 'unknown',
}

export enum AsBuiltValidationSeverity {
  Info = 'info',
  Warning = 'warning',
  Critical = 'critical',
}

export interface AsBuiltAssetRecord {
  id: string;
  name: string;
  type: string;
  status: AsBuiltAssetStatus;
  coordinatesSummary?: string;
  engineeringStatus?: string;
  connectedAssetIds: string[];
  fibreSummary?: string;
  documentNotes: string[];
  sourceAsset: EngineeringAssetSnapshot;
}

export interface AsBuiltValidationIssue {
  id: string;
  severity: AsBuiltValidationSeverity;
  assetId?: string;
  assetName?: string;
  message: string;
  recommendedAction: string;
}

export interface AsBuiltDocumentSummary {
  totalAssets: number;
  poles: number;
  chambers: number;
  distributionPoints: number;
  joints: number;
  cables: number;
  homes: number;
  areas: number;
  unknown: number;
  warnings: number;
  criticalIssues: number;
}

export interface AsBuiltDocumentModel {
  id: string;
  areaId: EngineeringAreaId;
  areaName?: string;
  documentType: EngineeringDocumentType.AsBuilt;
  revisionNumber?: string;
  generatedAt: string;
  generatedBy?: EngineeringUserId;
  reason: string;
  affectedAssets: string[];
  records: AsBuiltAssetRecord[];
  summary: AsBuiltDocumentSummary;
  validationIssues: AsBuiltValidationIssue[];
}

export interface BuildAsBuiltDocumentInput {
  areaId: EngineeringAreaId;
  areaName?: string;
  revisionNumber?: string;
  generatedBy?: EngineeringUserId;
  reason?: string;
  affectedAssets?: string[];
  assets: EngineeringAssetSnapshot[];
}
