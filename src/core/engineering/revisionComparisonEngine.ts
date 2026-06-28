import {
  EngineeringChangeType,
  EngineeringDocumentType,
  EngineeringImpactLevel,
} from './engineeringTypes';
import type {
  EngineeringAssetId,
  EngineeringAssetSnapshot,
  EngineeringFieldChange,
  EngineeringRevision,
} from './engineeringTypes';
import {
  analyseEngineeringChange,
} from './engineeringChangeEngine';

export enum EngineeringRevisionDiffType {
  AssetAdded = 'asset_added',
  AssetRemoved = 'asset_removed',
  AssetChanged = 'asset_changed',
  DocumentAdded = 'document_added',
  DocumentRemoved = 'document_removed',
  RevisionMetadataChanged = 'revision_metadata_changed',
}

export interface EngineeringAssetRevisionDiff {
  assetId: EngineeringAssetId;
  assetName?: string;
  assetType?: string;
  diffType: EngineeringRevisionDiffType;
  changeType: EngineeringChangeType;
  impact: EngineeringImpactLevel;
  fieldChanges: EngineeringFieldChange[];
  summary: string;
}

export interface EngineeringDocumentRevisionDiff {
  documentType: EngineeringDocumentType;
  diffType: EngineeringRevisionDiffType.DocumentAdded | EngineeringRevisionDiffType.DocumentRemoved;
}

export interface EngineeringRevisionComparisonInput {
  previousRevision?: EngineeringRevision | null;
  nextRevision?: EngineeringRevision | null;
  beforeAssets?: EngineeringAssetSnapshot[];
  afterAssets?: EngineeringAssetSnapshot[];
}

export interface EngineeringRevisionComparisonResult {
  previousRevisionNumber?: string;
  nextRevisionNumber?: string;
  hasChanges: boolean;
  assetDiffs: EngineeringAssetRevisionDiff[];
  documentDiffs: EngineeringDocumentRevisionDiff[];
  metadataChanges: EngineeringFieldChange[];
  affectedAssets: EngineeringAssetId[];
  affectedDocuments: EngineeringDocumentType[];
  majorChangeCount: number;
  summary: string;
}

const REVISION_METADATA_FIELDS: Array<keyof EngineeringRevision> = [
  'areaId',
  'revisionNumber',
  'reason',
  'status',
  'approvedBy',
  'approvedAt',
  'summary',
];

function byId(assets: EngineeringAssetSnapshot[] = []): Map<string, EngineeringAssetSnapshot> {
  return new Map(assets.filter((asset) => Boolean(asset?.id)).map((asset) => [asset.id, asset]));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function documentDiffs(
  previousDocuments: EngineeringDocumentType[] = [],
  nextDocuments: EngineeringDocumentType[] = [],
): EngineeringDocumentRevisionDiff[] {
  const previous = new Set(previousDocuments);
  const next = new Set(nextDocuments);

  return [
    ...nextDocuments
      .filter((documentType) => !previous.has(documentType))
      .map((documentType) => ({
        documentType,
        diffType: EngineeringRevisionDiffType.DocumentAdded as const,
      })),
    ...previousDocuments
      .filter((documentType) => !next.has(documentType))
      .map((documentType) => ({
        documentType,
        diffType: EngineeringRevisionDiffType.DocumentRemoved as const,
      })),
  ];
}

function metadataDiffs(
  previousRevision?: EngineeringRevision | null,
  nextRevision?: EngineeringRevision | null,
): EngineeringFieldChange[] {
  if (!previousRevision || !nextRevision) return [];

  return REVISION_METADATA_FIELDS.reduce<EngineeringFieldChange[]>((changes, field) => {
    const before = previousRevision[field];
    const after = nextRevision[field];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ path: String(field), before, after });
    }
    return changes;
  }, []);
}

function createAddedOrRemovedDiff(
  asset: EngineeringAssetSnapshot,
  diffType: EngineeringRevisionDiffType.AssetAdded | EngineeringRevisionDiffType.AssetRemoved,
): EngineeringAssetRevisionDiff {
  return {
    assetId: asset.id,
    assetName: asset.name,
    assetType: typeof asset.type === 'string' ? asset.type : undefined,
    diffType,
    changeType: diffType === EngineeringRevisionDiffType.AssetAdded
      ? EngineeringChangeType.AssetCreated
      : EngineeringChangeType.AssetDeleted,
    impact: EngineeringImpactLevel.Medium,
    fieldChanges: [],
    summary: `${asset.name || asset.id} ${diffType === EngineeringRevisionDiffType.AssetAdded ? 'added' : 'removed'}.`,
  };
}

export function compareEngineeringRevisions(
  input: EngineeringRevisionComparisonInput,
): EngineeringRevisionComparisonResult {
  const before = byId(input.beforeAssets);
  const after = byId(input.afterAssets);
  const ids = unique([...Array.from(before.keys()), ...Array.from(after.keys())]);

  const assetDiffs = ids.reduce<EngineeringAssetRevisionDiff[]>((diffs, assetId) => {
    const beforeAsset = before.get(assetId);
    const afterAsset = after.get(assetId);

    if (!beforeAsset && afterAsset) {
      diffs.push(createAddedOrRemovedDiff(afterAsset, EngineeringRevisionDiffType.AssetAdded));
      return diffs;
    }

    if (beforeAsset && !afterAsset) {
      diffs.push(createAddedOrRemovedDiff(beforeAsset, EngineeringRevisionDiffType.AssetRemoved));
      return diffs;
    }

    if (beforeAsset && afterAsset) {
      const analysis = analyseEngineeringChange({
        before: beforeAsset,
        after: afterAsset,
        areaId: afterAsset.areaId || beforeAsset.areaId,
        reason: input.nextRevision?.reason || input.previousRevision?.reason,
      });

      if (analysis.changeType !== EngineeringChangeType.NoAction || analysis.fieldChanges.length > 0) {
        diffs.push({
          assetId,
          assetName: afterAsset.name || beforeAsset.name,
          assetType: typeof (afterAsset.type || beforeAsset.type) === 'string'
            ? String(afterAsset.type || beforeAsset.type)
            : undefined,
          diffType: EngineeringRevisionDiffType.AssetChanged,
          changeType: analysis.changeType,
          impact: analysis.impact,
          fieldChanges: analysis.fieldChanges,
          summary: analysis.summary,
        });
      }
    }

    return diffs;
  }, []);

  const docs = documentDiffs(
    input.previousRevision?.affectedDocuments || [],
    input.nextRevision?.affectedDocuments || [],
  );
  const metadataChanges = metadataDiffs(input.previousRevision, input.nextRevision);
  const affectedAssets = unique([
    ...(input.nextRevision?.affectedAssets || []),
    ...assetDiffs.map((diff) => diff.assetId),
  ]);
  const affectedDocuments = unique([
    ...(input.nextRevision?.affectedDocuments || []),
    ...docs.map((diff) => diff.documentType),
  ]);
  const majorChangeCount = assetDiffs.filter((diff) => diff.impact === EngineeringImpactLevel.Major).length;
  const hasChanges = assetDiffs.length > 0 || docs.length > 0 || metadataChanges.length > 0;

  return {
    previousRevisionNumber: input.previousRevision?.revisionNumber,
    nextRevisionNumber: input.nextRevision?.revisionNumber,
    hasChanges,
    assetDiffs,
    documentDiffs: docs,
    metadataChanges,
    affectedAssets,
    affectedDocuments,
    majorChangeCount,
    summary: buildRevisionComparisonSummary(assetDiffs, docs, metadataChanges),
  };
}

export function buildRevisionComparisonSummary(
  assetDiffs: EngineeringAssetRevisionDiff[],
  docs: EngineeringDocumentRevisionDiff[],
  metadataChanges: EngineeringFieldChange[],
): string {
  if (assetDiffs.length === 0 && docs.length === 0 && metadataChanges.length === 0) {
    return 'No engineering differences detected between revisions.';
  }

  const added = assetDiffs.filter((diff) => diff.diffType === EngineeringRevisionDiffType.AssetAdded).length;
  const removed = assetDiffs.filter((diff) => diff.diffType === EngineeringRevisionDiffType.AssetRemoved).length;
  const changed = assetDiffs.filter((diff) => diff.diffType === EngineeringRevisionDiffType.AssetChanged).length;
  const major = assetDiffs.filter((diff) => diff.impact === EngineeringImpactLevel.Major).length;

  const parts = [
    assetDiffs.length ? `${assetDiffs.length} asset change${assetDiffs.length === 1 ? '' : 's'}` : '',
    added ? `${added} added` : '',
    removed ? `${removed} removed` : '',
    changed ? `${changed} changed` : '',
    docs.length ? `${docs.length} document change${docs.length === 1 ? '' : 's'}` : '',
    metadataChanges.length ? `${metadataChanges.length} revision metadata change${metadataChanges.length === 1 ? '' : 's'}` : '',
    major ? `${major} major engineering change${major === 1 ? '' : 's'}` : '',
  ].filter(Boolean);

  return parts.join(', ') + '.';
}

export function hasMajorEngineeringRevisionDifference(result: EngineeringRevisionComparisonResult): boolean {
  return result.majorChangeCount > 0;
}
