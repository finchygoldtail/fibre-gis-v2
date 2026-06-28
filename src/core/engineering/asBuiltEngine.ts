import {
  EngineeringAssetType,
  EngineeringDocumentType,
} from './engineeringTypes';
import type {
  EngineeringAssetSnapshot,
} from './engineeringTypes';
import {
  createEngineeringId,
} from './engineeringQueue';
import {
  AsBuiltAssetStatus,
  AsBuiltValidationSeverity,
} from './asBuiltTypes';
import type {
  AsBuiltAssetRecord,
  AsBuiltDocumentModel,
  AsBuiltDocumentSummary,
  AsBuiltValidationIssue,
  BuildAsBuiltDocumentInput,
} from './asBuiltTypes';
import type {
  EngineeringGeneratedDocumentSection,
} from './generatedDocumentsEngine';

function asString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function normalise(value: unknown): string {
  return asString(value, 'unknown').toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
}

function assetName(asset: EngineeringAssetSnapshot): string {
  return asString(asset.name || asset.label || asset.title || asset.id, 'Unnamed asset');
}

function assetType(asset: EngineeringAssetSnapshot): string {
  return normalise(asset.type || (asset as any).assetType || (asset as any).jointType || (asset as any).kind);
}

function hasCoordinates(asset: EngineeringAssetSnapshot): boolean {
  const coordinates = (asset as any).coordinates || (asset as any).geometry?.coordinates;
  return Array.isArray(coordinates) && coordinates.length > 0;
}

function coordinatesSummary(asset: EngineeringAssetSnapshot): string | undefined {
  const geometry = (asset as any).geometry;
  const coordinates = (asset as any).coordinates || geometry?.coordinates;
  if (!Array.isArray(coordinates) || !coordinates.length) return undefined;

  if (geometry?.type === 'Point' && coordinates.length >= 2) {
    return `${Number(coordinates[0]).toFixed(6)}, ${Number(coordinates[1]).toFixed(6)}`;
  }

  if (geometry?.type === 'LineString') return `${coordinates.length} route point${coordinates.length === 1 ? '' : 's'}`;
  if (geometry?.type === 'Polygon') return `${Array.isArray(coordinates[0]) ? coordinates[0].length : coordinates.length} boundary point${coordinates.length === 1 ? '' : 's'}`;
  return `${coordinates.length} coordinate entr${coordinates.length === 1 ? 'y' : 'ies'}`;
}

function readConnectedAssetIds(asset: EngineeringAssetSnapshot): string[] {
  const anyAsset = asset as any;
  const candidates = [
    anyAsset.parentCableId,
    anyAsset.parentDpId,
    anyAsset.connectedDpId,
    anyAsset.distributionPointId,
    anyAsset.dpId,
    anyAsset.homeId,
    anyAsset.toAssetId,
    anyAsset.fromAssetId,
    anyAsset.sourceAssetId,
    anyAsset.destinationAssetId,
    anyAsset.dpDetails?.parentCableId,
    anyAsset.dpDetails?.afnDetails?.throughCableId,
    anyAsset.dpDetails?.mduDetails?.throughCableId,
  ];

  return Array.from(
    new Set(
      candidates
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => asString(value))
        .filter(Boolean),
    ),
  );
}

function readFibreSummary(asset: EngineeringAssetSnapshot): string | undefined {
  const anyAsset = asset as any;
  const candidates = [
    anyAsset.fibreCount,
    anyAsset.fibres,
    anyAsset.fibreAllocation,
    anyAsset.allocatedInputFibres,
    anyAsset.dpDetails?.afnDetails?.inputFibres,
    anyAsset.dpDetails?.mduDetails?.inputFibres,
  ];

  const value = candidates.find((candidate) => {
    if (Array.isArray(candidate)) return candidate.length > 0;
    return asString(candidate).length > 0;
  });

  if (Array.isArray(value)) return `Input fibres: ${value.join(', ')}`;
  return value === undefined ? undefined : asString(value);
}

function inferAsBuiltStatus(asset: EngineeringAssetSnapshot, affectedAssets: Set<string>): AsBuiltAssetStatus {
  const rawStatus = normalise((asset as any).asBuiltStatus || (asset as any).engineeringStatus || asset.status);
  if (rawStatus.includes('remove') || rawStatus.includes('delete')) return AsBuiltAssetStatus.Removed;
  if (rawStatus.includes('new')) return AsBuiltAssetStatus.New;
  if (rawStatus.includes('modified') || rawStatus.includes('changed')) return AsBuiltAssetStatus.Modified;
  if (affectedAssets.has(String(asset.id))) return AsBuiltAssetStatus.Modified;
  if (rawStatus === 'unknown') return AsBuiltAssetStatus.Unknown;
  return AsBuiltAssetStatus.Existing;
}

function buildAssetNotes(asset: EngineeringAssetSnapshot): string[] {
  const notes = [asString(asset.notes), asString((asset as any).properties?.notes), asString((asset as any).asBuiltNotes)].filter(Boolean);
  return Array.from(new Set(notes));
}

function buildRecord(asset: EngineeringAssetSnapshot, affectedAssets: Set<string>): AsBuiltAssetRecord {
  return {
    id: String(asset.id),
    name: assetName(asset),
    type: assetType(asset),
    status: inferAsBuiltStatus(asset, affectedAssets),
    coordinatesSummary: coordinatesSummary(asset),
    engineeringStatus: asString(asset.status || (asset as any).buildStatus || (asset as any).properties?.status, undefined as any),
    connectedAssetIds: readConnectedAssetIds(asset),
    fibreSummary: readFibreSummary(asset),
    documentNotes: buildAssetNotes(asset),
    sourceAsset: asset,
  };
}

function countByType(records: AsBuiltAssetRecord[], matcher: (type: string) => boolean): number {
  return records.filter((record) => matcher(record.type)).length;
}

function buildValidationIssues(records: AsBuiltAssetRecord[]): AsBuiltValidationIssue[] {
  const issues: AsBuiltValidationIssue[] = [];

  records.forEach((record) => {
    if (!record.id) {
      issues.push({
        id: createEngineeringId('asbuilt_issue'),
        severity: AsBuiltValidationSeverity.Critical,
        assetName: record.name,
        message: 'Asset has no stable id.',
        recommendedAction: 'Fix the live map asset id before issuing the As-Built pack.',
      });
    }

    if (!record.coordinatesSummary && record.type !== EngineeringAssetType.CommercialDocument) {
      issues.push({
        id: createEngineeringId('asbuilt_issue'),
        severity: AsBuiltValidationSeverity.Warning,
        assetId: record.id,
        assetName: record.name,
        message: 'Asset has no geometry or coordinate summary available.',
        recommendedAction: 'Check the live map geometry before issuing the As-Built pack.',
      });
    }

    if ((record.type.includes('cable') || record.type === EngineeringAssetType.Cable) && !record.fibreSummary) {
      issues.push({
        id: createEngineeringId('asbuilt_issue'),
        severity: AsBuiltValidationSeverity.Warning,
        assetId: record.id,
        assetName: record.name,
        message: 'Cable has no fibre count or fibre allocation summary.',
        recommendedAction: 'Add fibre count/allocation to the live cable before issuing As-Builts.',
      });
    }
  });

  return issues;
}

function buildSummary(records: AsBuiltAssetRecord[], issues: AsBuiltValidationIssue[]): AsBuiltDocumentSummary {
  return {
    totalAssets: records.length,
    poles: countByType(records, (type) => type.includes('pole')),
    chambers: countByType(records, (type) => type.includes('chamber')),
    distributionPoints: countByType(records, (type) => type.includes('distribution') || type === 'dp'),
    joints: countByType(records, (type) => type.includes('joint')),
    cables: countByType(records, (type) => type.includes('cable')),
    homes: countByType(records, (type) => type.includes('home')),
    areas: countByType(records, (type) => type.includes('area') || type.includes('polygon')),
    unknown: countByType(records, (type) => type === 'unknown'),
    warnings: issues.filter((issue) => issue.severity === AsBuiltValidationSeverity.Warning).length,
    criticalIssues: issues.filter((issue) => issue.severity === AsBuiltValidationSeverity.Critical).length,
  };
}

export function buildAsBuiltDocumentFromLiveAssets(input: BuildAsBuiltDocumentInput): AsBuiltDocumentModel {
  const affected = new Set((input.affectedAssets || []).map(String));
  const records = input.assets.map((asset) => buildRecord(asset, affected));
  const validationIssues = buildValidationIssues(records);

  return {
    id: createEngineeringId('asbuilt_doc'),
    areaId: input.areaId,
    areaName: input.areaName,
    documentType: EngineeringDocumentType.AsBuilt,
    revisionNumber: input.revisionNumber,
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy,
    reason: input.reason || 'Generated from live map state.',
    affectedAssets: input.affectedAssets || [],
    records,
    summary: buildSummary(records, validationIssues),
    validationIssues,
  };
}

export function buildAsBuiltSections(model: AsBuiltDocumentModel): EngineeringGeneratedDocumentSection[] {
  const summary = model.summary;
  const assetLines = model.records
    .slice()
    .sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name))
    .map((record) => {
      const parts = [record.name, record.type, record.status];
      if (record.coordinatesSummary) parts.push(record.coordinatesSummary);
      if (record.fibreSummary) parts.push(record.fibreSummary);
      return parts.join(' | ');
    });

  const issueLines = model.validationIssues.map((issue) => {
    const prefix = issue.assetName ? `${issue.assetName}: ` : '';
    return `${issue.severity.toUpperCase()} - ${prefix}${issue.message} ${issue.recommendedAction}`;
  });

  return [
    {
      title: 'As-Built Summary',
      lines: [
        `Total assets: ${summary.totalAssets}`,
        `Poles: ${summary.poles}`,
        `Chambers: ${summary.chambers}`,
        `Distribution Points: ${summary.distributionPoints}`,
        `Joints: ${summary.joints}`,
        `Cables: ${summary.cables}`,
        `Homes: ${summary.homes}`,
        `Areas: ${summary.areas}`,
        `Warnings: ${summary.warnings}`,
        `Critical issues: ${summary.criticalIssues}`,
      ],
    },
    {
      title: 'As-Built Asset Register',
      lines: assetLines.length ? assetLines : ['No assets supplied for this As-Built generation run.'],
    },
    {
      title: 'As-Built Validation',
      lines: issueLines.length ? issueLines : ['No As-Built validation issues found.'],
    },
  ];
}

export function buildAsBuiltSectionsFromLiveAssets(input: BuildAsBuiltDocumentInput): EngineeringGeneratedDocumentSection[] {
  return buildAsBuiltSections(buildAsBuiltDocumentFromLiveAssets(input));
}
