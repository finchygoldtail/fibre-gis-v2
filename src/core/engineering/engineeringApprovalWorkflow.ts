import {
  EngineeringDocumentType,
  EngineeringImpactLevel,
  EngineeringQueueStatus,
  EngineeringRevisionStatus,
} from './engineeringTypes';
import type {
  EngineeringQueueItem,
  EngineeringRevision,
  EngineeringUserId,
} from './engineeringTypes';
import {
  approveEngineeringQueueItem,
  rejectEngineeringQueueItem,
  transitionEngineeringQueueItem,
  createEngineeringId,
} from './engineeringQueue';
import {
  approveEngineeringRevision,
  issueEngineeringRevision,
} from './revisionEngine';

export enum EngineeringApprovalStepType {
  EngineeringReview = 'engineering_review',
  ManagerApproval = 'manager_approval',
  CommercialApproval = 'commercial_approval',
  DeliveryRelease = 'delivery_release',
}

export enum EngineeringApprovalStepStatus {
  Waiting = 'waiting',
  Ready = 'ready',
  Approved = 'approved',
  Rejected = 'rejected',
  Skipped = 'skipped',
}

export enum EngineeringApprovalWorkflowStatus {
  Draft = 'draft',
  InReview = 'in_review',
  Approved = 'approved',
  Rejected = 'rejected',
  Released = 'released',
}

export interface EngineeringApprovalStep {
  id: string;
  type: EngineeringApprovalStepType;
  label: string;
  status: EngineeringApprovalStepStatus;
  required: boolean;
  approvedBy?: EngineeringUserId;
  approvedAt?: string;
  rejectedBy?: EngineeringUserId;
  rejectedAt?: string;
  note?: string;
}

export interface EngineeringApprovalWorkflow {
  id: string;
  queueItemId: string;
  revisionId?: string;
  areaId: string;
  status: EngineeringApprovalWorkflowStatus;
  reason: string;
  priority: string;
  impact: EngineeringImpactLevel;
  affectedDocuments: EngineeringDocumentType[];
  affectedAssets: string[];
  createdAt: string;
  createdBy?: EngineeringUserId;
  releasedBy?: EngineeringUserId;
  releasedAt?: string;
  steps: EngineeringApprovalStep[];
}

export interface EngineeringApprovalActionResult {
  workflow: EngineeringApprovalWorkflow;
  queueItem: EngineeringQueueItem;
  revision?: EngineeringRevision;
  nextStep?: EngineeringApprovalStep;
  summary: string;
}

function formatDocumentLabel(documentType: EngineeringDocumentType): string {
  switch (documentType) {
    case EngineeringDocumentType.BuildPack:
      return 'Build Pack';
    case EngineeringDocumentType.FAS:
      return 'FAS';
    case EngineeringDocumentType.AsBuilt:
      return 'As-Built';
    case EngineeringDocumentType.WalkOffPack:
      return 'Walk-Off Pack';
    case EngineeringDocumentType.CommercialPack:
      return 'Commercial Pack';
    case EngineeringDocumentType.CompletionPack:
      return 'Completion Pack';
    case EngineeringDocumentType.MaintenancePack:
      return 'Maintenance Pack';
    case EngineeringDocumentType.QAPack:
      return 'QA Pack';
    default:
      return documentType;
  }
}

function createStep(type: EngineeringApprovalStepType, label: string, required: boolean, ready: boolean): EngineeringApprovalStep {
  return {
    id: createEngineeringId('eng_approval_step'),
    type,
    label,
    required,
    status: required ? (ready ? EngineeringApprovalStepStatus.Ready : EngineeringApprovalStepStatus.Waiting) : EngineeringApprovalStepStatus.Skipped,
  };
}

function containsAnyDocument(queueItem: EngineeringQueueItem, documents: EngineeringDocumentType[]): boolean {
  return queueItem.pendingDocuments.some((documentType) => documents.includes(documentType));
}

export function createEngineeringApprovalWorkflow(
  queueItem: EngineeringQueueItem,
  revision?: EngineeringRevision,
  createdBy?: EngineeringUserId,
): EngineeringApprovalWorkflow {
  const needsCommercialApproval = containsAnyDocument(queueItem, [EngineeringDocumentType.CommercialPack]);
  const needsDeliveryRelease = containsAnyDocument(queueItem, [
    EngineeringDocumentType.BuildPack,
    EngineeringDocumentType.FAS,
    EngineeringDocumentType.AsBuilt,
    EngineeringDocumentType.WalkOffPack,
    EngineeringDocumentType.CompletionPack,
    EngineeringDocumentType.MaintenancePack,
  ]);

  const steps = [
    createStep(EngineeringApprovalStepType.EngineeringReview, 'Engineering review', true, true),
    createStep(EngineeringApprovalStepType.ManagerApproval, 'Manager approval', queueItem.approvalRequired, false),
    createStep(EngineeringApprovalStepType.CommercialApproval, 'Commercial approval', needsCommercialApproval, false),
    createStep(EngineeringApprovalStepType.DeliveryRelease, 'Delivery release', needsDeliveryRelease, false),
  ];

  return {
    id: createEngineeringId('eng_approval'),
    queueItemId: queueItem.id,
    revisionId: revision?.id,
    areaId: queueItem.areaId,
    status: EngineeringApprovalWorkflowStatus.InReview,
    reason: queueItem.reason,
    priority: queueItem.priority,
    impact: queueItem.impact,
    affectedDocuments: queueItem.pendingDocuments,
    affectedAssets: queueItem.affectedAssets,
    createdAt: new Date().toISOString(),
    createdBy,
    steps,
  };
}

export function getCurrentApprovalStep(workflow: EngineeringApprovalWorkflow): EngineeringApprovalStep | undefined {
  return workflow.steps.find((step) => step.required && step.status === EngineeringApprovalStepStatus.Ready);
}

function activateNextWaitingStep(steps: EngineeringApprovalStep[]): EngineeringApprovalStep[] {
  const nextWaitingIndex = steps.findIndex((step) => step.required && step.status === EngineeringApprovalStepStatus.Waiting);
  if (nextWaitingIndex === -1) return steps;
  return steps.map((step, index) => (
    index === nextWaitingIndex ? { ...step, status: EngineeringApprovalStepStatus.Ready } : step
  ));
}

function allRequiredStepsApproved(steps: EngineeringApprovalStep[]): boolean {
  return steps.every((step) => !step.required || step.status === EngineeringApprovalStepStatus.Approved);
}

export function approveCurrentEngineeringStep(
  workflow: EngineeringApprovalWorkflow,
  queueItem: EngineeringQueueItem,
  approvedBy: EngineeringUserId,
  revision?: EngineeringRevision,
  note?: string,
): EngineeringApprovalActionResult {
  const currentStep = getCurrentApprovalStep(workflow);
  if (!currentStep) {
    return {
      workflow,
      queueItem,
      revision,
      summary: 'No approval step is ready.',
    };
  }

  const approvedAt = new Date().toISOString();
  let steps = workflow.steps.map((step) => (
    step.id === currentStep.id
      ? { ...step, status: EngineeringApprovalStepStatus.Approved, approvedBy, approvedAt, note }
      : step
  ));

  steps = activateNextWaitingStep(steps);

  const approved = allRequiredStepsApproved(steps);
  const nextStep = steps.find((step) => step.required && step.status === EngineeringApprovalStepStatus.Ready);

  const updatedWorkflow: EngineeringApprovalWorkflow = {
    ...workflow,
    status: approved ? EngineeringApprovalWorkflowStatus.Approved : EngineeringApprovalWorkflowStatus.InReview,
    steps,
  };

  const updatedQueueItem = approved
    ? approveEngineeringQueueItem(queueItem, approvedBy)
    : transitionEngineeringQueueItem(queueItem, EngineeringQueueStatus.PendingApproval);

  const updatedRevision = approved && revision && revision.status === EngineeringRevisionStatus.PendingApproval
    ? approveEngineeringRevision(revision, approvedBy)
    : revision;

  return {
    workflow: updatedWorkflow,
    queueItem: updatedQueueItem,
    revision: updatedRevision,
    nextStep,
    summary: approved
      ? 'Engineering approval workflow approved.'
      : `Approved ${currentStep.label}. Next step: ${nextStep?.label ?? 'review'}.`,
  };
}

export function rejectEngineeringApprovalWorkflow(
  workflow: EngineeringApprovalWorkflow,
  queueItem: EngineeringQueueItem,
  rejectedBy: EngineeringUserId,
  revision?: EngineeringRevision,
  note?: string,
): EngineeringApprovalActionResult {
  const currentStep = getCurrentApprovalStep(workflow);
  const rejectedAt = new Date().toISOString();

  const steps = workflow.steps.map((step) => (
    step.id === currentStep?.id
      ? { ...step, status: EngineeringApprovalStepStatus.Rejected, rejectedBy, rejectedAt, note }
      : step
  ));

  return {
    workflow: {
      ...workflow,
      status: EngineeringApprovalWorkflowStatus.Rejected,
      steps,
    },
    queueItem: rejectEngineeringQueueItem(queueItem),
    revision: revision ? { ...revision, status: EngineeringRevisionStatus.Rejected } : undefined,
    summary: currentStep ? `Rejected ${currentStep.label}.` : 'Engineering approval workflow rejected.',
  };
}

export function releaseApprovedEngineeringWorkflow(
  workflow: EngineeringApprovalWorkflow,
  queueItem: EngineeringQueueItem,
  releasedBy: EngineeringUserId,
  revision?: EngineeringRevision,
): EngineeringApprovalActionResult {
  if (workflow.status !== EngineeringApprovalWorkflowStatus.Approved) {
    return {
      workflow,
      queueItem,
      revision,
      summary: 'Workflow must be approved before release.',
    };
  }

  const releasedAt = new Date().toISOString();
  return {
    workflow: {
      ...workflow,
      status: EngineeringApprovalWorkflowStatus.Released,
      releasedBy,
      releasedAt,
    },
    queueItem: transitionEngineeringQueueItem(queueItem, EngineeringQueueStatus.Regenerating),
    revision: revision ? issueEngineeringRevision(revision) : undefined,
    summary: `Released engineering documents: ${workflow.affectedDocuments.map(formatDocumentLabel).join(', ')}.`,
  };
}

export function summariseApprovalWorkflow(workflow: EngineeringApprovalWorkflow): string {
  const currentStep = getCurrentApprovalStep(workflow);
  if (workflow.status === EngineeringApprovalWorkflowStatus.Released) return 'Released to Delivery.';
  if (workflow.status === EngineeringApprovalWorkflowStatus.Rejected) return 'Rejected.';
  if (workflow.status === EngineeringApprovalWorkflowStatus.Approved) return 'Approved and waiting for release.';
  return currentStep ? `Waiting for ${currentStep.label}.` : 'Waiting for review.';
}
