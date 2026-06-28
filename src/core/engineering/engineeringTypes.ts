export type EngineeringAssetId = string;
export type EngineeringAreaId = string;
export type EngineeringUserId = string;

export enum EngineeringAssetType {
  Area = 'area',
  Home = 'home',
  DistributionPoint = 'distribution_point',
  Pole = 'pole',
  Chamber = 'chamber',
  Joint = 'joint',
  Cable = 'cable',
  StreetCab = 'street_cab',
  CommercialDocument = 'commercial_document',
  Unknown = 'unknown',
}

export enum EngineeringChangeType {
  NoAction = 'no_action',
  NoteChange = 'note_change',
  PhotoChange = 'photo_change',
  FibreAllocationChange = 'fibre_allocation_change',
  HomeMove = 'home_move',
  DistributionPointMove = 'distribution_point_move',
  PoleMove = 'pole_move',
  CableRouteChange = 'cable_route_change',
  CommercialDocumentChange = 'commercial_document_change',
  AttributeChange = 'attribute_change',
  AssetCreated = 'asset_created',
  AssetDeleted = 'asset_deleted',
  MixedChange = 'mixed_change',
}

export enum EngineeringImpactLevel {
  None = 'none',
  Low = 'low',
  Medium = 'medium',
  Major = 'major',
  CommercialOnly = 'commercial_only',
}

export enum EngineeringDocumentType {
  BuildPack = 'build_pack',
  FAS = 'fas',
  AsBuilt = 'as_built',
  WalkOffPack = 'walk_off_pack',
  CommercialPack = 'commercial_pack',
  CompletionPack = 'completion_pack',
  MaintenancePack = 'maintenance_pack',
  QAPack = 'qa_pack',
}

export enum EngineeringQueueStatus {
  Draft = 'draft',
  PendingReview = 'pending_review',
  PendingApproval = 'pending_approval',
  Approved = 'approved',
  Rejected = 'rejected',
  Regenerating = 'regenerating',
  Complete = 'complete',
  Cancelled = 'cancelled',
}

export enum EngineeringRevisionStatus {
  Draft = 'draft',
  PendingApproval = 'pending_approval',
  Approved = 'approved',
  Issued = 'issued',
  Superseded = 'superseded',
  Rejected = 'rejected',
}

export enum EngineeringPriority {
  Low = 'low',
  Normal = 'normal',
  High = 'high',
  Critical = 'critical',
}

export interface EngineeringCoordinates {
  lat: number;
  lng: number;
}

export interface EngineeringAssetSnapshot {
  id: EngineeringAssetId;
  type?: EngineeringAssetType | string;
  areaId?: EngineeringAreaId;
  name?: string;
  status?: string;
  geometry?: unknown;
  coordinates?: EngineeringCoordinates | EngineeringCoordinates[] | unknown;
  fibreAllocation?: unknown;
  fibres?: unknown;
  homes?: unknown;
  photos?: unknown[];
  notes?: string;
  commercial?: unknown;
  updatedAt?: string;
  updatedBy?: EngineeringUserId;
  [key: string]: unknown;
}

export interface EngineeringChangeInput {
  before?: EngineeringAssetSnapshot | EngineeringAssetSnapshot[] | null;
  after?: EngineeringAssetSnapshot | EngineeringAssetSnapshot[] | null;
  areaId?: EngineeringAreaId;
  userId?: EngineeringUserId;
  reason?: string;
  source?: string;
}

export interface EngineeringFieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

export interface EngineeringChangeAnalysis {
  changeType: EngineeringChangeType;
  impact: EngineeringImpactLevel;
  affectedDocuments: EngineeringDocumentType[];
  requiresRevision: boolean;
  requiresApproval: boolean;
  summary: string;
  affectedAssets: EngineeringAssetId[];
  fieldChanges: EngineeringFieldChange[];
  priority: EngineeringPriority;
  reason?: string;
  areaId?: EngineeringAreaId;
}

export interface EngineeringRule {
  id: string;
  label: string;
  changeTypes: EngineeringChangeType[];
  impact: EngineeringImpactLevel;
  affectedDocuments: EngineeringDocumentType[];
  requiresRevision: boolean;
  requiresApproval: boolean;
  priority: EngineeringPriority;
}

export interface EngineeringQueueItem {
  id: string;
  areaId: EngineeringAreaId;
  areaName?: string;
  currentRevision?: string;
  pendingDocuments: EngineeringDocumentType[];
  reason: string;
  priority: EngineeringPriority;
  approvalRequired: boolean;
  status: EngineeringQueueStatus;
  changeType: EngineeringChangeType;
  impact: EngineeringImpactLevel;
  affectedAssets: EngineeringAssetId[];
  createdAt: string;
  createdBy?: EngineeringUserId;
  approvedBy?: EngineeringUserId;
  approvedAt?: string;
  analysis: EngineeringChangeAnalysis;
}

export interface EngineeringRevision {
  id: string;
  areaId: EngineeringAreaId;
  revisionNumber: string;
  createdAt: string;
  createdBy?: EngineeringUserId;
  approvedBy?: EngineeringUserId;
  approvedAt?: string;
  reason: string;
  affectedAssets: EngineeringAssetId[];
  affectedDocuments: EngineeringDocumentType[];
  status: EngineeringRevisionStatus;
  queueItemId?: string;
  summary?: string;
}

export interface EngineeringHistoryEvent {
  id: string;
  areaId?: EngineeringAreaId;
  assetId?: EngineeringAssetId;
  queueItemId?: string;
  revisionId?: string;
  eventType: string;
  summary: string;
  createdAt: string;
  createdBy?: EngineeringUserId;
  metadata?: Record<string, unknown>;
}

export interface DocumentGenerationRequest {
  id: string;
  areaId: EngineeringAreaId;
  documentType: EngineeringDocumentType;
  revisionNumber?: string;
  requestedAt: string;
  requestedBy?: EngineeringUserId;
  reason: string;
  affectedAssets: EngineeringAssetId[];
}

export interface DocumentGenerationResult {
  requestId: string;
  documentType: EngineeringDocumentType;
  status: 'queued' | 'generated' | 'failed';
  generatedAt?: string;
  outputPath?: string;
  error?: string;
}

export interface EngineeringQueueSummary {
  pendingBuildPacks: number;
  pendingFAS: number;
  pendingMajorChanges: number;
  pendingEngineeringReviews: number;
  pendingApprovals: number;
}
