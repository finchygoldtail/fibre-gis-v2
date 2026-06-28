import type {
  EngineeringChangeAnalysis,
  EngineeringHistoryEvent,
  EngineeringQueueItem,
  EngineeringRevision,
  EngineeringUserId,
} from './engineeringTypes';
import {
  createEngineeringId,
} from './engineeringQueue';

export function createEngineeringHistoryEvent(input: {
  eventType: string;
  summary: string;
  areaId?: string;
  assetId?: string;
  queueItemId?: string;
  revisionId?: string;
  createdBy?: EngineeringUserId;
  metadata?: Record<string, unknown>;
}): EngineeringHistoryEvent {
  return {
    id: createEngineeringId('eng_history'),
    eventType: input.eventType,
    summary: input.summary,
    areaId: input.areaId,
    assetId: input.assetId,
    queueItemId: input.queueItemId,
    revisionId: input.revisionId,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    metadata: input.metadata,
  };
}

export function historyFromAnalysis(
  analysis: EngineeringChangeAnalysis,
  createdBy?: EngineeringUserId,
): EngineeringHistoryEvent {
  return createEngineeringHistoryEvent({
    eventType: `engineering.${analysis.changeType}`,
    summary: analysis.summary,
    areaId: analysis.areaId,
    createdBy,
    metadata: {
      impact: analysis.impact,
      affectedDocuments: analysis.affectedDocuments,
      affectedAssets: analysis.affectedAssets,
      requiresRevision: analysis.requiresRevision,
      requiresApproval: analysis.requiresApproval,
    },
  });
}

export function historyFromQueueItem(
  item: EngineeringQueueItem,
  createdBy?: EngineeringUserId,
): EngineeringHistoryEvent {
  return createEngineeringHistoryEvent({
    eventType: `engineering.queue.${item.status}`,
    summary: item.reason,
    areaId: item.areaId,
    queueItemId: item.id,
    createdBy,
    metadata: { ...item },
  });
}

export function historyFromRevision(
  revision: EngineeringRevision,
  createdBy?: EngineeringUserId,
): EngineeringHistoryEvent {
  return createEngineeringHistoryEvent({
    eventType: `engineering.revision.${revision.status}`,
    summary: revision.summary ?? revision.reason,
    areaId: revision.areaId,
    revisionId: revision.id,
    createdBy,
    metadata: { ...revision },
  });
}
