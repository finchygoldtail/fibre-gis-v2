import {
  EngineeringDocumentType,
} from './engineeringTypes';
import type {
  DocumentGenerationRequest,
  DocumentGenerationResult,
  EngineeringAreaId,
  EngineeringQueueItem,
  EngineeringRevision,
  EngineeringUserId,
} from './engineeringTypes';
import {
  createEngineeringId,
} from './engineeringQueue';

export interface EngineeringDocumentGenerator {
  type: EngineeringDocumentType;
  generate: (request: DocumentGenerationRequest) => Promise<DocumentGenerationResult> | DocumentGenerationResult;
}

export function createDocumentGenerationRequests(
  areaId: EngineeringAreaId,
  documentTypes: EngineeringDocumentType[],
  reason: string,
  affectedAssets: string[],
  requestedBy?: EngineeringUserId,
  revisionNumber?: string,
): DocumentGenerationRequest[] {
  return Array.from(new Set(documentTypes)).map((documentType) => ({
    id: createEngineeringId('doc_request'),
    areaId,
    documentType,
    revisionNumber,
    requestedAt: new Date().toISOString(),
    requestedBy,
    reason,
    affectedAssets,
  }));
}

export function createDocumentRequestsFromQueue(
  queueItem: EngineeringQueueItem,
  requestedBy?: EngineeringUserId,
): DocumentGenerationRequest[] {
  return createDocumentGenerationRequests(
    queueItem.areaId,
    queueItem.pendingDocuments,
    queueItem.reason,
    queueItem.affectedAssets,
    requestedBy,
    queueItem.currentRevision,
  );
}

export function createDocumentRequestsFromRevision(
  revision: EngineeringRevision,
  requestedBy?: EngineeringUserId,
): DocumentGenerationRequest[] {
  return createDocumentGenerationRequests(
    revision.areaId,
    revision.affectedDocuments,
    revision.reason,
    revision.affectedAssets,
    requestedBy,
    revision.revisionNumber,
  );
}

export async function runDocumentGenerators(
  requests: DocumentGenerationRequest[],
  generators: EngineeringDocumentGenerator[],
): Promise<DocumentGenerationResult[]> {
  const results: DocumentGenerationResult[] = [];
  for (const request of requests) {
    const generator = generators.find((item) => item.type === request.documentType);
    if (!generator) {
      results.push({
        requestId: request.id,
        documentType: request.documentType,
        status: 'queued',
      });
      continue;
    }

    try {
      results.push(await generator.generate(request));
    } catch (error) {
      results.push({
        requestId: request.id,
        documentType: request.documentType,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown document generation error',
      });
    }
  }
  return results;
}
