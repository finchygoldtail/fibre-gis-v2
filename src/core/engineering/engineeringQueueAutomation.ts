import {
  analyseEngineeringChange,
} from './engineeringChangeEngine';
import {
  createDocumentRequestsFromQueue,
} from './documentEngine';
import {
  historyFromQueueItem,
} from './engineeringHistory';
import {
  createEngineeringQueueItem,
  mergeEngineeringQueueItems,
} from './engineeringQueue';
import {
  EngineeringQueueStatus,
} from './engineeringTypes';
import type {
  DocumentGenerationRequest,
  EngineeringAreaId,
  EngineeringAssetSnapshot,
  EngineeringChangeAnalysis,
  EngineeringChangeInput,
  EngineeringHistoryEvent,
  EngineeringQueueItem,
  EngineeringUserId,
} from './engineeringTypes';

export interface EngineeringQueueCreationContext {
  areaId: EngineeringAreaId;
  areaName?: string;
  currentRevision?: string;
  createdBy?: EngineeringUserId;
  source?: string;
  existingQueue?: EngineeringQueueItem[];
}

export interface EngineeringQueueCreationResult {
  analysis: EngineeringChangeAnalysis;
  queueItem: EngineeringQueueItem | null;
  queue: EngineeringQueueItem[];
  documentRequests: DocumentGenerationRequest[];
  historyEvents: EngineeringHistoryEvent[];
  shouldBlockAutoIssue: boolean;
}

export function createEngineeringQueueFromChange(
  before: EngineeringAssetSnapshot | EngineeringAssetSnapshot[] | null | undefined,
  after: EngineeringAssetSnapshot | EngineeringAssetSnapshot[] | null | undefined,
  context: EngineeringQueueCreationContext,
): EngineeringQueueCreationResult {
  return createEngineeringQueueFromAnalysis(
    analyseEngineeringChange({
      before,
      after,
      areaId: context.areaId,
      userId: context.createdBy,
      source: context.source,
    }),
    context,
  );
}

export function createEngineeringQueueFromInput(
  input: EngineeringChangeInput,
  context: EngineeringQueueCreationContext,
): EngineeringQueueCreationResult {
  return createEngineeringQueueFromAnalysis(
    analyseEngineeringChange({
      ...input,
      areaId: input.areaId ?? context.areaId,
      userId: input.userId ?? context.createdBy,
      source: input.source ?? context.source,
    }),
    context,
  );
}

export function createEngineeringQueueFromAnalysis(
  analysis: EngineeringChangeAnalysis,
  context: EngineeringQueueCreationContext,
): EngineeringQueueCreationResult {
  const queueItem = createEngineeringQueueItem({
    areaId: context.areaId,
    areaName: context.areaName,
    currentRevision: context.currentRevision,
    analysis,
    createdBy: context.createdBy,
  });

  const queue = queueItem
    ? mergeEngineeringQueueItems(context.existingQueue ?? [], queueItem)
    : [...(context.existingQueue ?? [])];

  const documentRequests = queueItem ? createDocumentRequestsFromQueue(queueItem, context.createdBy) : [];
  const historyEvents = queueItem ? [historyFromQueueItem(queueItem, context.createdBy)] : [];

  return {
    analysis,
    queueItem,
    queue,
    documentRequests,
    historyEvents,
    shouldBlockAutoIssue: Boolean(queueItem?.approvalRequired || queueItem?.status === EngineeringQueueStatus.PendingApproval),
  };
}

export function buildEngineeringSaveHookPayload(result: EngineeringQueueCreationResult) {
  return {
    engineeringAnalysis: result.analysis,
    engineeringQueueItem: result.queueItem,
    engineeringDocumentRequests: result.documentRequests,
    engineeringHistoryEvents: result.historyEvents,
    requiresEngineeringApproval: result.shouldBlockAutoIssue,
  };
}
