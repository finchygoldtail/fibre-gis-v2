import {
  mergeEngineeringRules,
} from './engineeringRules';
import {
  EngineeringChangeType,
} from './engineeringTypes';
import type {
  EngineeringChangeAnalysis,
  EngineeringChangeInput,
} from './engineeringTypes';
import {
  choosePrimaryChangeType,
  classifyFieldChanges,
  getChangedFields,
  normaliseAssetList,
} from './engineeringImpactEngine';

export function analyseEngineeringChange(
  beforeOrInput?: EngineeringChangeInput['before'] | EngineeringChangeInput,
  afterArg?: EngineeringChangeInput['after'],
): EngineeringChangeAnalysis {
  const input = isChangeInput(beforeOrInput) ? beforeOrInput : { before: beforeOrInput, after: afterArg };
  const beforeList = normaliseAssetList(input.before);
  const afterList = normaliseAssetList(input.after);
  const assetIds = new Set([...beforeList, ...afterList].map((asset) => asset.id).filter(Boolean));
  const fieldChanges = [];
  const detectedTypes: EngineeringChangeType[] = [];

  if (!assetIds.size && !beforeList.length && !afterList.length) {
    detectedTypes.push(EngineeringChangeType.NoAction);
  }

  assetIds.forEach((assetId) => {
    const before = beforeList.find((asset) => asset.id === assetId) ?? null;
    const after = afterList.find((asset) => asset.id === assetId) ?? null;
    const changes = getChangedFields(before, after);
    fieldChanges.push(...changes.map((change) => ({ ...change, path: `${assetId}.${change.path}` })));
    detectedTypes.push(...classifyFieldChanges(after ?? before ?? undefined, changes));
  });

  const primaryChangeType = choosePrimaryChangeType(detectedTypes);
  const effectiveTypes = primaryChangeType === EngineeringChangeType.MixedChange ? detectedTypes : [primaryChangeType];
  const rule = mergeEngineeringRules(effectiveTypes);

  return {
    changeType: primaryChangeType,
    impact: rule.impact,
    affectedDocuments: rule.affectedDocuments,
    requiresRevision: rule.requiresRevision,
    requiresApproval: rule.requiresApproval,
    summary: buildSummary(primaryChangeType, fieldChanges.length, rule.affectedDocuments.length),
    affectedAssets: Array.from(assetIds),
    fieldChanges,
    priority: rule.priority,
    reason: input.reason,
    areaId: input.areaId ?? inferAreaId(beforeList, afterList),
  };
}

function isChangeInput(value: unknown): value is EngineeringChangeInput {
  return !!value && typeof value === 'object' && ('before' in value || 'after' in value || 'reason' in value || 'areaId' in value);
}

function inferAreaId(beforeList: { areaId?: string }[], afterList: { areaId?: string }[]): string | undefined {
  return afterList.find((asset) => asset.areaId)?.areaId ?? beforeList.find((asset) => asset.areaId)?.areaId;
}

function buildSummary(changeType: EngineeringChangeType, changeCount: number, documentCount: number): string {
  if (changeType === EngineeringChangeType.NoAction) return 'No engineering action required.';
  const docs = documentCount === 1 ? '1 document' : `${documentCount} documents`;
  const changes = changeCount === 1 ? '1 field change' : `${changeCount} field changes`;
  return `${changeType.replace(/_/g, ' ')} detected from ${changes}; ${docs} affected.`;
}
