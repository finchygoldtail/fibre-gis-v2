import {
  EngineeringImpactLevel,
} from './engineeringTypes';
import type {
  EngineeringAreaId,
  EngineeringAssetId,
  EngineeringAssetSnapshot,
  EngineeringUserId,
} from './engineeringTypes';
import {
  EngineeringRevisionDiffType,
  compareEngineeringRevisions,
} from './revisionComparisonEngine';
import {
  toEngineeringAssetSnapshot,
} from './engineeringDigitalTwinEngine';
import type {
  EngineeringTwinSnapshot,
} from './engineeringDigitalTwinEngine';

export enum EngineeringRollbackActionType {
  RestoreAsset = 'restore_asset',
  RemoveAsset = 'remove_asset',
  RevertAssetChange = 'revert_asset_change',
  NoAction = 'no_action',
}

export enum EngineeringRollbackPlanStatus {
  Draft = 'draft',
  PendingApproval = 'pending_approval',
  Approved = 'approved',
  Applied = 'applied',
  Cancelled = 'cancelled',
}

export interface EngineeringRollbackAction {
  id: string;
  actionType: EngineeringRollbackActionType;
  assetId: EngineeringAssetId;
  assetName?: string;
  assetType?: string;
  impact: EngineeringImpactLevel;
  summary: string;
  before?: EngineeringAssetSnapshot;
  after?: EngineeringAssetSnapshot;
  changedFields: string[];
}

export interface EngineeringRollbackPlan {
  id: string;
  areaId: EngineeringAreaId;
  areaName?: string;
  targetSnapshotId: string;
  targetRevisionNumber: string;
  status: EngineeringRollbackPlanStatus;
  reason: string;
  createdAt: string;
  createdBy?: EngineeringUserId;
  actionCount: number;
  majorActionCount: number;
  affectedAssets: EngineeringAssetId[];
  actions: EngineeringRollbackAction[];
  summary: string;
}

export interface EngineeringRollbackPlanInput {
  areaId: EngineeringAreaId;
  areaName?: string;
  targetSnapshot: EngineeringTwinSnapshot;
  currentAssets: unknown[];
  reason?: string;
  createdBy?: EngineeringUserId;
}

function createRollbackId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function byId(assets: EngineeringAssetSnapshot[]): Map<EngineeringAssetId, EngineeringAssetSnapshot> {
  return new Map(assets.filter((asset) => Boolean(asset?.id)).map((asset) => [asset.id, asset]));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function getAssetLabel(asset?: EngineeringAssetSnapshot): string | undefined {
  if (!asset) return undefined;
  const source = asset as any;
  return asset.name || source.label || source.title || source.properties?.name || source.properties?.label;
}

function mapDiffToRollbackAction(
  diff: ReturnType<typeof compareEngineeringRevisions>['assetDiffs'][number],
  currentAsset: EngineeringAssetSnapshot | undefined,
  targetAsset: EngineeringAssetSnapshot | undefined,
): EngineeringRollbackAction {
  let actionType = EngineeringRollbackActionType.NoAction;
  let summary = diff.summary;

  if (diff.diffType === EngineeringRevisionDiffType.AssetAdded) {
    actionType = EngineeringRollbackActionType.RestoreAsset;
    summary = `${diff.assetName || diff.assetId} exists in the target baseline but is missing from the live map. It should be restored.`;
  } else if (diff.diffType === EngineeringRevisionDiffType.AssetRemoved) {
    actionType = EngineeringRollbackActionType.RemoveAsset;
    summary = `${diff.assetName || diff.assetId} exists in the live map but not in the target baseline. It should be removed or parked before rollback.`;
  } else if (diff.diffType === EngineeringRevisionDiffType.AssetChanged) {
    actionType = EngineeringRollbackActionType.RevertAssetChange;
    summary = `${diff.assetName || diff.assetId} should be reverted to the selected engineering baseline.`;
  }

  return {
    id: createRollbackId('rollback_action'),
    actionType,
    assetId: diff.assetId,
    assetName: diff.assetName || getAssetLabel(targetAsset) || getAssetLabel(currentAsset),
    assetType: diff.assetType || String(targetAsset?.type || currentAsset?.type || ''),
    impact: diff.impact,
    summary,
    before: currentAsset,
    after: targetAsset,
    changedFields: diff.fieldChanges.map((field) => field.path),
  };
}

export function createEngineeringRollbackPlan(input: EngineeringRollbackPlanInput): EngineeringRollbackPlan {
  const currentAssets = input.currentAssets.map((asset) => toEngineeringAssetSnapshot(asset, input.areaId));
  const targetAssets = input.targetSnapshot.assets || [];
  const current = byId(currentAssets);
  const target = byId(targetAssets);

  const comparison = compareEngineeringRevisions({
    previousRevision: {
      id: `live-${Date.now()}`,
      areaId: input.areaId,
      revisionNumber: 'LIVE-MAP',
      createdAt: new Date().toISOString(),
      reason: 'Current live map state before rollback preview.',
      affectedAssets: currentAssets.map((asset) => asset.id),
      affectedDocuments: [],
      status: 'draft' as any,
      summary: 'Current live map state before rollback preview.',
    },
    nextRevision: {
      id: input.targetSnapshot.id,
      areaId: input.targetSnapshot.areaId,
      revisionNumber: input.targetSnapshot.revisionNumber,
      createdAt: input.targetSnapshot.createdAt,
      createdBy: input.targetSnapshot.createdBy,
      reason: input.targetSnapshot.reason,
      affectedAssets: input.targetSnapshot.assetIds,
      affectedDocuments: [],
      status: 'issued' as any,
      summary: input.targetSnapshot.reason,
    },
    beforeAssets: currentAssets,
    afterAssets: targetAssets,
  });

  const actions = comparison.assetDiffs
    .map((diff) => mapDiffToRollbackAction(diff, current.get(diff.assetId), target.get(diff.assetId)))
    .filter((action) => action.actionType !== EngineeringRollbackActionType.NoAction);

  const majorActionCount = actions.filter((action) => action.impact === EngineeringImpactLevel.Major).length;
  const affectedAssets = unique(actions.map((action) => action.assetId));

  return {
    id: createRollbackId('engineering_rollback'),
    areaId: input.areaId,
    areaName: input.areaName || input.targetSnapshot.areaName,
    targetSnapshotId: input.targetSnapshot.id,
    targetRevisionNumber: input.targetSnapshot.revisionNumber,
    status: EngineeringRollbackPlanStatus.Draft,
    reason: input.reason || `Preview rollback to ${input.targetSnapshot.revisionNumber}.`,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    actionCount: actions.length,
    majorActionCount,
    affectedAssets,
    actions,
    summary: buildEngineeringRollbackSummary(actions, input.targetSnapshot.revisionNumber),
  };
}

export function buildEngineeringRollbackSummary(
  actions: EngineeringRollbackAction[],
  targetRevisionNumber: string,
): string {
  if (!actions.length) {
    return `Live map already matches ${targetRevisionNumber}. No rollback actions required.`;
  }

  const restoreCount = actions.filter((action) => action.actionType === EngineeringRollbackActionType.RestoreAsset).length;
  const removeCount = actions.filter((action) => action.actionType === EngineeringRollbackActionType.RemoveAsset).length;
  const revertCount = actions.filter((action) => action.actionType === EngineeringRollbackActionType.RevertAssetChange).length;
  const majorCount = actions.filter((action) => action.impact === EngineeringImpactLevel.Major).length;

  const parts = [
    `${actions.length} rollback action${actions.length === 1 ? '' : 's'}`,
    restoreCount ? `${restoreCount} restore` : '',
    removeCount ? `${removeCount} remove` : '',
    revertCount ? `${revertCount} revert` : '',
    majorCount ? `${majorCount} major approval${majorCount === 1 ? '' : 's'} required` : '',
  ].filter(Boolean);

  return `Rollback to ${targetRevisionNumber}: ${parts.join(', ')}.`;
}

export function rollbackPlanRequiresApproval(plan: EngineeringRollbackPlan): boolean {
  return plan.majorActionCount > 0 || plan.actionCount > 0;
}
