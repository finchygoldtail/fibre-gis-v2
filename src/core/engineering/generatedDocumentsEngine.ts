import {
  buildAsBuiltSectionsFromLiveAssets,
} from './asBuiltEngine';
import {
  buildFasAllocationFromLiveAssets,
} from './fasAllocationEngine';
import {
  buildJobPackFromLiveAssets,
} from './jobPackEngine';
import {
  EngineeringDocumentType,
  EngineeringQueueStatus,
} from './engineeringTypes';
import type {
  DocumentGenerationRequest,
  EngineeringAreaId,
  EngineeringAssetSnapshot,
  EngineeringUserId,
} from './engineeringTypes';
import {
  readLocalEngineeringDocumentRequests,
  readLocalEngineeringQueue,
  writeLocalEngineeringQueue,
} from './engineeringLocalQueueStorage';
import {
  createEngineeringId,
} from './engineeringQueue';

const GENERATED_DOCUMENT_STORAGE_KEY = 'alistra-engineering-generated-documents:v1';

export type EngineeringGeneratedDocumentStatus = 'draft' | 'generated' | 'ready_for_review' | 'issued' | 'superseded';

export interface EngineeringGeneratedDocumentSection {
  title: string;
  lines: string[];
}

export interface EngineeringGeneratedDocument {
  id: string;
  areaId: EngineeringAreaId;
  areaName?: string;
  documentType: EngineeringDocumentType;
  documentNumber: string;
  revisionNumber?: string;
  status: EngineeringGeneratedDocumentStatus;
  generatedAt: string;
  generatedBy?: EngineeringUserId;
  sourceRequestId?: string;
  reason: string;
  affectedAssets: string[];
  assetCount: number;
  sections: EngineeringGeneratedDocumentSection[];
}

export interface GenerateEngineeringDocumentsInput {
  areaId: EngineeringAreaId;
  areaName?: string;
  assets: EngineeringAssetSnapshot[];
  generatedBy?: EngineeringUserId;
}

function canUseBrowserStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readJsonArray<T>(key: string): T[] {
  if (!canUseBrowserStorage()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(key: string, value: T[]): void {
  if (!canUseBrowserStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Generated document storage must never block the live map.
  }
}

function documentLabel(type: EngineeringDocumentType): string {
  switch (type) {
    case EngineeringDocumentType.BuildPack:
      return 'BUILD-PACK';
    case EngineeringDocumentType.FAS:
      return 'FAS';
    case EngineeringDocumentType.AsBuilt:
      return 'AS-BUILT';
    case EngineeringDocumentType.WalkOffPack:
      return 'WALK-OFF';
    case EngineeringDocumentType.CommercialPack:
      return 'COMMERCIAL';
    case EngineeringDocumentType.CompletionPack:
      return 'COMPLETION';
    case EngineeringDocumentType.MaintenancePack:
      return 'MAINTENANCE';
    case EngineeringDocumentType.QAPack:
      return 'QA';
    default:
      return String(type).toUpperCase();
  }
}

function safeAssetName(asset: EngineeringAssetSnapshot): string {
  return String(asset.name || asset.label || asset.title || asset.id || 'Unnamed asset');
}

function assetType(asset: EngineeringAssetSnapshot): string {
  return String(asset.type || asset.assetType || asset.kind || 'asset');
}

function summariseAssets(assets: EngineeringAssetSnapshot[]): string[] {
  const counts = assets.reduce<Record<string, number>>((acc, asset) => {
    const key = assetType(asset);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const lines = Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type}: ${count}`);

  return lines.length ? lines : ['No live assets supplied to this generation run.'];
}

function affectedAssetLines(request: DocumentGenerationRequest, assets: EngineeringAssetSnapshot[]): string[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const lines = request.affectedAssets.map((assetId) => {
    const asset = byId.get(assetId);
    if (!asset) return `${assetId}: asset not present in current workspace view`;
    return `${safeAssetName(asset)} (${assetType(asset)})`;
  });

  return lines.length ? lines : ['No specific affected assets recorded.'];
}

function createDocumentNumber(areaId: string, type: EngineeringDocumentType, revisionNumber?: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const revision = revisionNumber || 'LIVE';
  return `${areaId}-${documentLabel(type)}-${revision}-${stamp}`.replace(/\s+/g, '-').toUpperCase();
}

function buildSections(
  request: DocumentGenerationRequest,
  areaName: string | undefined,
  assets: EngineeringAssetSnapshot[],
): EngineeringGeneratedDocumentSection[] {
  const baseSections: EngineeringGeneratedDocumentSection[] = [
    {
      title: 'Source of Truth',
      lines: [
        'Generated from the live Alistra GIS map state.',
        'This document should not be manually edited. Update the live map and regenerate instead.',
      ],
    },
    {
      title: 'Area and Revision',
      lines: [
        `Area: ${areaName || request.areaId}`,
        `Revision: ${request.revisionNumber || 'Live map draft'}`,
        `Reason: ${request.reason}`,
      ],
    },
    {
      title: 'Affected Assets',
      lines: affectedAssetLines(request, assets),
    },
    {
      title: 'Live Asset Summary',
      lines: summariseAssets(assets),
    },
  ];

  if (request.documentType === EngineeringDocumentType.FAS) {
    const fas = buildFasAllocationFromLiveAssets({
      areaId: request.areaId,
      areaName,
      assets,
    });
    return [...baseSections, ...fas.sections];
  }

  if (request.documentType === EngineeringDocumentType.AsBuilt) {
    const asBuiltSections = buildAsBuiltSectionsFromLiveAssets({
      areaId: request.areaId,
      areaName,
      revisionNumber: request.revisionNumber,
      reason: request.reason,
      affectedAssets: request.affectedAssets,
      assets,
    });
    return [...baseSections, ...asBuiltSections];
  }

  if (request.documentType === EngineeringDocumentType.BuildPack) {
    const jobPack = buildJobPackFromLiveAssets({
      areaId: request.areaId,
      areaName,
      revisionNumber: request.revisionNumber,
      reason: request.reason,
      affectedAssets: request.affectedAssets,
      assets,
      generatedBy: request.requestedBy,
    });
    return [
      ...baseSections,
      ...jobPack.sections.map((section) => ({
        title: section.title,
        lines: section.lines,
      })),
    ];
  }

  return baseSections;
}

export function createGeneratedEngineeringDocument(
  request: DocumentGenerationRequest,
  input: GenerateEngineeringDocumentsInput,
): EngineeringGeneratedDocument {
  return {
    id: createEngineeringId('generated_doc'),
    areaId: input.areaId,
    areaName: input.areaName,
    documentType: request.documentType,
    documentNumber: createDocumentNumber(input.areaId, request.documentType, request.revisionNumber),
    revisionNumber: request.revisionNumber,
    status: 'ready_for_review',
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy,
    sourceRequestId: request.id,
    reason: request.reason,
    affectedAssets: request.affectedAssets,
    assetCount: input.assets.length,
    sections: buildSections(request, input.areaName, input.assets),
  };
}

export function readLocalGeneratedEngineeringDocuments(areaId?: EngineeringAreaId): EngineeringGeneratedDocument[] {
  const documents = readJsonArray<EngineeringGeneratedDocument>(GENERATED_DOCUMENT_STORAGE_KEY);
  if (!areaId) return documents;
  return documents.filter((document) => document.areaId === areaId);
}

export function writeLocalGeneratedEngineeringDocuments(documents: EngineeringGeneratedDocument[]): void {
  writeJsonArray(GENERATED_DOCUMENT_STORAGE_KEY, documents);
}

export function generatePendingEngineeringDocuments(input: GenerateEngineeringDocumentsInput): EngineeringGeneratedDocument[] {
  const requests = readLocalEngineeringDocumentRequests(input.areaId);
  const existing = readLocalGeneratedEngineeringDocuments();
  const generatedRequestIds = new Set(existing.map((document) => document.sourceRequestId).filter(Boolean));
  const pendingRequests = requests.filter((request) => !generatedRequestIds.has(request.id));

  if (!pendingRequests.length) return [];

  const generated = pendingRequests.map((request) => createGeneratedEngineeringDocument(request, input));
  writeLocalGeneratedEngineeringDocuments([...existing, ...generated]);

  const queue = readLocalEngineeringQueue();
  const requestDocumentTypes = new Set(pendingRequests.map((request) => `${request.areaId}:${request.documentType}`));
  const updatedQueue = queue.map((item) => {
    const hasMatchingDocument = item.pendingDocuments.some((documentType) =>
      requestDocumentTypes.has(`${item.areaId}:${documentType}`),
    );
    if (!hasMatchingDocument) return item;
    return {
      ...item,
      status: item.approvalRequired ? EngineeringQueueStatus.PendingApproval : EngineeringQueueStatus.Regenerating,
    };
  });
  writeLocalEngineeringQueue(updatedQueue);

  return generated;
}

export function markGeneratedDocumentIssued(documentId: string, issuedBy?: EngineeringUserId): EngineeringGeneratedDocument | undefined {
  const documents = readLocalGeneratedEngineeringDocuments();
  let issued: EngineeringGeneratedDocument | undefined;

  const updated = documents.map((document) => {
    if (document.id !== documentId) return document;
    issued = {
      ...document,
      status: 'issued',
      generatedBy: issuedBy || document.generatedBy,
    };
    return issued;
  });

  writeLocalGeneratedEngineeringDocuments(updated);
  return issued;
}
