import {
  EngineeringDocumentType,
  EngineeringPriority,
  EngineeringQueueStatus,
} from './engineeringTypes';
import type {
  EngineeringAreaId,
  EngineeringChangeAnalysis,
  EngineeringQueueItem,
  EngineeringQueueSummary,
  EngineeringUserId,
} from './engineeringTypes';

export interface CreateEngineeringQueueItemInput {
  areaId: EngineeringAreaId;
  areaName?: string;
  currentRevision?: string;
  analysis: EngineeringChangeAnalysis;
  createdBy?: EngineeringUserId;
}

export function createEngineeringQueueItem(input: CreateEngineeringQueueItemInput): EngineeringQueueItem | null {
  const { analysis } = input;
  if (!analysis.affectedDocuments.length && !analysis.requiresApproval && !analysis.requiresRevision) return null;

  return {
    id: createEngineeringId('eng_queue'),
    areaId: input.areaId,
    areaName: input.areaName,
    currentRevision: input.currentRevision,
    pendingDocuments: analysis.affectedDocuments,
    reason: analysis.reason ?? analysis.summary,
    priority: analysis.priority,
    approvalRequired: analysis.requiresApproval || analysis.requiresRevision,
    status: analysis.requiresApproval || analysis.requiresRevision
      ? EngineeringQueueStatus.PendingApproval
      : EngineeringQueueStatus.PendingReview,
    changeType: analysis.changeType,
    impact: analysis.impact,
    affectedAssets: analysis.affectedAssets,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    analysis,
  };
}

export function approveEngineeringQueueItem(
  item: EngineeringQueueItem,
  approvedBy: EngineeringUserId,
): EngineeringQueueItem {
  return {
    ...item,
    status: EngineeringQueueStatus.Approved,
    approvedBy,
    approvedAt: new Date().toISOString(),
  };
}

export function rejectEngineeringQueueItem(item: EngineeringQueueItem): EngineeringQueueItem {
  return { ...item, status: EngineeringQueueStatus.Rejected };
}

export function completeEngineeringQueueItem(item: EngineeringQueueItem): EngineeringQueueItem {
  return { ...item, status: EngineeringQueueStatus.Complete };
}

export function summariseEngineeringQueue(items: EngineeringQueueItem[]): EngineeringQueueSummary {
  const active = items.filter((item) => ![
    EngineeringQueueStatus.Complete,
    EngineeringQueueStatus.Cancelled,
    EngineeringQueueStatus.Rejected,
  ].includes(item.status));

  return {
    pendingBuildPacks: active.filter((item) => item.pendingDocuments.includes(EngineeringDocumentType.BuildPack)).length,
    pendingFAS: active.filter((item) => item.pendingDocuments.includes(EngineeringDocumentType.FAS)).length,
    pendingMajorChanges: active.filter((item) => item.priority === EngineeringPriority.High || item.priority === EngineeringPriority.Critical).length,
    pendingEngineeringReviews: active.filter((item) => item.status === EngineeringQueueStatus.PendingReview).length,
    pendingApprovals: active.filter((item) => item.status === EngineeringQueueStatus.PendingApproval || item.approvalRequired).length,
  };
}


export function mergeEngineeringQueueItems(
  existingItems: EngineeringQueueItem[],
  newItem: EngineeringQueueItem,
): EngineeringQueueItem[] {
  const canMerge = (item: EngineeringQueueItem) =>
    item.areaId === newItem.areaId
    && item.status === newItem.status
    && item.approvalRequired === newItem.approvalRequired
    && item.changeType === newItem.changeType
    && item.currentRevision === newItem.currentRevision;

  const match = existingItems.find(canMerge);
  if (!match) return [newItem, ...existingItems];

  return existingItems.map((item) => {
    if (item.id !== match.id) return item;
    return {
      ...item,
      pendingDocuments: Array.from(new Set([...item.pendingDocuments, ...newItem.pendingDocuments])),
      affectedAssets: Array.from(new Set([...item.affectedAssets, ...newItem.affectedAssets])),
      reason: `${item.reason}; ${newItem.reason}`,
      analysis: {
        ...newItem.analysis,
        affectedDocuments: Array.from(new Set([...item.analysis.affectedDocuments, ...newItem.analysis.affectedDocuments])),
        affectedAssets: Array.from(new Set([...item.analysis.affectedAssets, ...newItem.analysis.affectedAssets])),
        fieldChanges: [...item.analysis.fieldChanges, ...newItem.analysis.fieldChanges],
        summary: `${item.analysis.summary}; ${newItem.analysis.summary}`,
      },
    };
  });
}

export function transitionEngineeringQueueItem(
  item: EngineeringQueueItem,
  status: EngineeringQueueStatus,
): EngineeringQueueItem {
  return { ...item, status };
}

export function createEngineeringId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
