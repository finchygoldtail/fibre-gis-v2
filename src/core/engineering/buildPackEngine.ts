import {
  EngineeringDocumentType,
} from './engineeringTypes';
import type {
  DocumentGenerationRequest,
  EngineeringQueueItem,
  EngineeringRevision,
} from './engineeringTypes';
import {
  createDocumentGenerationRequests,
} from './documentEngine';

export interface BuildPackRegenerationPlan {
  areaId: string;
  revisionNumber?: string;
  reason: string;
  affectedAssets: string[];
  documents: EngineeringDocumentType[];
  approvalRequired: boolean;
  requests: DocumentGenerationRequest[];
}

export function createBuildPackRegenerationPlanFromQueue(
  queueItem: EngineeringQueueItem,
): BuildPackRegenerationPlan {
  const documents = ensureBuildPackDocuments(queueItem.pendingDocuments);
  return {
    areaId: queueItem.areaId,
    revisionNumber: queueItem.currentRevision,
    reason: queueItem.reason,
    affectedAssets: queueItem.affectedAssets,
    documents,
    approvalRequired: queueItem.approvalRequired,
    requests: createDocumentGenerationRequests(
      queueItem.areaId,
      documents,
      queueItem.reason,
      queueItem.affectedAssets,
      queueItem.createdBy,
      queueItem.currentRevision,
    ),
  };
}

export function createBuildPackRegenerationPlanFromRevision(
  revision: EngineeringRevision,
): BuildPackRegenerationPlan {
  const documents = ensureBuildPackDocuments(revision.affectedDocuments);
  return {
    areaId: revision.areaId,
    revisionNumber: revision.revisionNumber,
    reason: revision.reason,
    affectedAssets: revision.affectedAssets,
    documents,
    approvalRequired: true,
    requests: createDocumentGenerationRequests(
      revision.areaId,
      documents,
      revision.reason,
      revision.affectedAssets,
      revision.createdBy,
      revision.revisionNumber,
    ),
  };
}

export function ensureBuildPackDocuments(documents: EngineeringDocumentType[]): EngineeringDocumentType[] {
  const output = new Set(documents);
  if (output.has(EngineeringDocumentType.BuildPack)) output.add(EngineeringDocumentType.FAS);
  return Array.from(output);
}
