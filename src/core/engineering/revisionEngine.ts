import {
  EngineeringRevisionStatus,
} from './engineeringTypes';
import type {
  EngineeringQueueItem,
  EngineeringRevision,
  EngineeringUserId,
} from './engineeringTypes';
import {
  createEngineeringId,
} from './engineeringQueue';

export function nextRevisionNumber(currentRevision?: string): string {
  if (!currentRevision) return 'R1';
  const match = currentRevision.match(/^(.*?)(\d+)$/);
  if (!match) return `${currentRevision}-R1`;
  const prefix = match[1] || 'R';
  const number = Number(match[2]);
  return `${prefix}${Number.isFinite(number) ? number + 1 : 1}`;
}

export function createEngineeringRevisionFromQueue(
  queueItem: EngineeringQueueItem,
  createdBy?: EngineeringUserId,
): EngineeringRevision {
  return {
    id: createEngineeringId('eng_revision'),
    areaId: queueItem.areaId,
    revisionNumber: nextRevisionNumber(queueItem.currentRevision),
    createdAt: new Date().toISOString(),
    createdBy,
    reason: queueItem.reason,
    affectedAssets: queueItem.affectedAssets,
    affectedDocuments: queueItem.pendingDocuments,
    status: queueItem.approvalRequired ? EngineeringRevisionStatus.PendingApproval : EngineeringRevisionStatus.Draft,
    queueItemId: queueItem.id,
    summary: queueItem.analysis.summary,
  };
}

export function approveEngineeringRevision(
  revision: EngineeringRevision,
  approvedBy: EngineeringUserId,
): EngineeringRevision {
  return {
    ...revision,
    status: EngineeringRevisionStatus.Approved,
    approvedBy,
    approvedAt: new Date().toISOString(),
  };
}

export function issueEngineeringRevision(revision: EngineeringRevision): EngineeringRevision {
  return { ...revision, status: EngineeringRevisionStatus.Issued };
}

export function supersedeEngineeringRevision(revision: EngineeringRevision): EngineeringRevision {
  return { ...revision, status: EngineeringRevisionStatus.Superseded };
}
