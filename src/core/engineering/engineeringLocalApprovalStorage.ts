import type {
  EngineeringQueueItem,
  EngineeringRevision,
  EngineeringUserId,
} from './engineeringTypes';
import {
  approveCurrentEngineeringStep,
  createEngineeringApprovalWorkflow,
  rejectEngineeringApprovalWorkflow,
  releaseApprovedEngineeringWorkflow,
} from './engineeringApprovalWorkflow';
import type {
  EngineeringApprovalActionResult,
  EngineeringApprovalWorkflow,
} from './engineeringApprovalWorkflow';

const APPROVAL_STORAGE_KEY = 'alistra-engineering-approvals:v1';

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
    // Approval persistence must never block the live map save path.
  }
}

function upsertWorkflow(workflows: EngineeringApprovalWorkflow[], workflow: EngineeringApprovalWorkflow): EngineeringApprovalWorkflow[] {
  const exists = workflows.some((item) => item.id === workflow.id);
  if (!exists) return [workflow, ...workflows];
  return workflows.map((item) => (item.id === workflow.id ? workflow : item));
}

export function readLocalEngineeringApprovals(areaId?: string): EngineeringApprovalWorkflow[] {
  const workflows = readJsonArray<EngineeringApprovalWorkflow>(APPROVAL_STORAGE_KEY);
  if (!areaId) return workflows;
  return workflows.filter((workflow) => workflow.areaId === areaId);
}

export function writeLocalEngineeringApprovals(workflows: EngineeringApprovalWorkflow[]): void {
  writeJsonArray(APPROVAL_STORAGE_KEY, workflows);
}

export function findLocalEngineeringApprovalForQueue(queueItemId: string): EngineeringApprovalWorkflow | undefined {
  return readLocalEngineeringApprovals().find((workflow) => workflow.queueItemId === queueItemId);
}

export function ensureLocalEngineeringApprovalWorkflow(
  queueItem: EngineeringQueueItem,
  revision?: EngineeringRevision,
  createdBy?: EngineeringUserId,
): EngineeringApprovalWorkflow {
  const existing = findLocalEngineeringApprovalForQueue(queueItem.id);
  if (existing) return existing;

  const workflow = createEngineeringApprovalWorkflow(queueItem, revision, createdBy);
  writeLocalEngineeringApprovals(upsertWorkflow(readLocalEngineeringApprovals(), workflow));
  return workflow;
}

export function approveLocalEngineeringWorkflowStep(
  queueItem: EngineeringQueueItem,
  approvedBy: EngineeringUserId,
  revision?: EngineeringRevision,
  note?: string,
): EngineeringApprovalActionResult {
  const workflow = ensureLocalEngineeringApprovalWorkflow(queueItem, revision, approvedBy);
  const result = approveCurrentEngineeringStep(workflow, queueItem, approvedBy, revision, note);
  writeLocalEngineeringApprovals(upsertWorkflow(readLocalEngineeringApprovals(), result.workflow));
  return result;
}

export function rejectLocalEngineeringWorkflow(
  queueItem: EngineeringQueueItem,
  rejectedBy: EngineeringUserId,
  revision?: EngineeringRevision,
  note?: string,
): EngineeringApprovalActionResult {
  const workflow = ensureLocalEngineeringApprovalWorkflow(queueItem, revision, rejectedBy);
  const result = rejectEngineeringApprovalWorkflow(workflow, queueItem, rejectedBy, revision, note);
  writeLocalEngineeringApprovals(upsertWorkflow(readLocalEngineeringApprovals(), result.workflow));
  return result;
}

export function releaseLocalEngineeringWorkflow(
  queueItem: EngineeringQueueItem,
  releasedBy: EngineeringUserId,
  revision?: EngineeringRevision,
): EngineeringApprovalActionResult {
  const workflow = ensureLocalEngineeringApprovalWorkflow(queueItem, revision, releasedBy);
  const result = releaseApprovedEngineeringWorkflow(workflow, queueItem, releasedBy, revision);
  writeLocalEngineeringApprovals(upsertWorkflow(readLocalEngineeringApprovals(), result.workflow));
  return result;
}

export function clearLocalEngineeringApprovals(areaId?: string): void {
  if (!areaId) {
    writeLocalEngineeringApprovals([]);
    return;
  }

  writeLocalEngineeringApprovals(
    readLocalEngineeringApprovals().filter((workflow) => workflow.areaId !== areaId),
  );
}
