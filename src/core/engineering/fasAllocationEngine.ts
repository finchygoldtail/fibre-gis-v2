import {
  EngineeringAssetType,
} from './engineeringTypes';
import type {
  EngineeringAssetSnapshot,
} from './engineeringTypes';
import type {
  EngineeringGeneratedDocumentSection,
} from './generatedDocumentsEngine';

export type FasAllocationStatus = 'allocated' | 'reserved' | 'missing_data' | 'conflict' | 'spare';

export interface FasAllocationRow {
  id: string;
  sequence: number;
  areaId?: string;
  sourceAssetId?: string;
  sourceAssetName: string;
  sourceAssetType: string;
  destinationAssetId?: string;
  destinationAssetName: string;
  cableId?: string;
  cableName?: string;
  fibreNumber?: number;
  fibreLabel: string;
  allocationType: 'home' | 'dp' | 'mdu' | 'afn' | 'reserved' | 'unknown';
  status: FasAllocationStatus;
  notes: string;
}

export interface FasAllocationSummary {
  totalRows: number;
  allocatedFibres: number;
  reservedFibres: number;
  missingData: number;
  conflicts: number;
  sourceAssets: number;
  destinationAssets: number;
}

export interface FasAllocationBuildResult {
  areaId: string;
  areaName?: string;
  generatedAt: string;
  rows: FasAllocationRow[];
  summary: FasAllocationSummary;
  warnings: string[];
  sections: EngineeringGeneratedDocumentSection[];
}

function asString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function assetName(asset: EngineeringAssetSnapshot | undefined, fallback = 'Unknown asset'): string {
  if (!asset) return fallback;
  return asString(asset.name || asset.label || asset.title || asset.id, fallback);
}

function assetType(asset: EngineeringAssetSnapshot | undefined): string {
  if (!asset) return 'unknown';
  return asString(asset.type || asset.assetType || asset.kind, 'unknown');
}

function normaliseAssetType(asset: EngineeringAssetSnapshot): string {
  return assetType(asset).toLowerCase().replace(/_/g, '-');
}

function isDistributionPoint(asset: EngineeringAssetSnapshot): boolean {
  const type = normaliseAssetType(asset);
  return type === EngineeringAssetType.DistributionPoint || type === 'distribution-point' || type.includes('distribution');
}

function isHome(asset: EngineeringAssetSnapshot): boolean {
  const type = normaliseAssetType(asset);
  return type === EngineeringAssetType.Home || type === 'home';
}

function isCable(asset: EngineeringAssetSnapshot): boolean {
  const type = normaliseAssetType(asset);
  return type === EngineeringAssetType.Cable || type === 'cable' || type.includes('cable');
}

function parseFibreCount(value: unknown): number | undefined {
  const match = asString(value).match(/\d+/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readInputFibres(asset: EngineeringAssetSnapshot): number[] {
  const anyAsset = asset as any;
  const candidates = [
    anyAsset.allocatedInputFibres,
    anyAsset.inputFibres,
    anyAsset.dpDetails?.afnDetails?.inputFibres,
    anyAsset.dpDetails?.mduDetails?.inputFibres,
    anyAsset.afnDetails?.inputFibres,
    anyAsset.mduDetails?.inputFibres,
    anyAsset.fibres,
    anyAsset.fibreAllocation,
  ];

  const fibres = candidates.flatMap((candidate) => {
    if (Array.isArray(candidate)) return candidate;
    if (typeof candidate === 'number') return [candidate];
    if (typeof candidate === 'string') {
      return candidate
        .split(/[ ,]+/)
        .map((part) => Number(part.trim()))
        .filter((part) => Number.isFinite(part));
    }
    return [];
  });

  return Array.from(new Set(fibres.map((fibre) => Number(fibre)).filter((fibre) => Number.isFinite(fibre) && fibre > 0))).sort(
    (left, right) => left - right,
  );
}

function findCableForAsset(asset: EngineeringAssetSnapshot, cablesById: Map<string, EngineeringAssetSnapshot>): EngineeringAssetSnapshot | undefined {
  const anyAsset = asset as any;
  const candidates = [
    anyAsset.parentCableId,
    anyAsset.throughCableId,
    anyAsset.dpDetails?.afnDetails?.throughCableId,
    anyAsset.dpDetails?.mduDetails?.throughCableId,
    anyAsset.afnDetails?.throughCableId,
    anyAsset.mduDetails?.throughCableId,
    anyAsset.cableId,
  ].filter(Boolean);

  for (const id of candidates) {
    const cable = cablesById.get(String(id));
    if (cable) return cable;
  }

  return undefined;
}

function createRow(input: Omit<FasAllocationRow, 'id' | 'sequence'>, sequence: number): FasAllocationRow {
  return {
    id: `fas-row-${sequence}`,
    sequence,
    ...input,
  };
}

function buildRows(areaId: string, assets: EngineeringAssetSnapshot[]): FasAllocationRow[] {
  const rows: FasAllocationRow[] = [];
  const cables = assets.filter(isCable);
  const cablesById = new Map(cables.map((cable) => [String(cable.id), cable]));
  const dps = assets.filter(isDistributionPoint);
  const homes = assets.filter(isHome);
  const homesByDp = new Map<string, EngineeringAssetSnapshot[]>();

  homes.forEach((home) => {
    const anyHome = home as any;
    const dpId = asString(anyHome.dpId || anyHome.distributionPointId || anyHome.connectedDpId || anyHome.parentDpId);
    if (!dpId) return;
    const existing = homesByDp.get(dpId) || [];
    existing.push(home);
    homesByDp.set(dpId, existing);
  });

  dps.forEach((dp) => {
    const fibres = readInputFibres(dp);
    const cable = findCableForAsset(dp, cablesById);
    const linkedHomes = homesByDp.get(String(dp.id)) || [];
    const anyDp = dp as any;
    const architecture = asString(anyDp.dpDetails?.networkArchitecture || anyDp.dpDetails?.closureType || anyDp.closureType, 'unknown');

    if (!fibres.length) {
      rows.push(
        createRow(
          {
            areaId,
            sourceAssetId: cable?.id,
            sourceAssetName: assetName(cable, 'No parent cable recorded'),
            sourceAssetType: assetType(cable),
            destinationAssetId: dp.id,
            destinationAssetName: assetName(dp),
            cableId: cable?.id,
            cableName: cable ? assetName(cable) : undefined,
            fibreLabel: 'No input fibre recorded',
            allocationType: architecture.toLowerCase().includes('mdu') ? 'mdu' : architecture.toLowerCase().includes('afn') ? 'afn' : 'dp',
            status: 'missing_data',
            notes: 'DP has no recorded input fibre allocation. Update the live map DP fibre allocation before issuing FAS.',
          },
          rows.length + 1,
        ),
      );
      return;
    }

    fibres.forEach((fibre) => {
      rows.push(
        createRow(
          {
            areaId,
            sourceAssetId: cable?.id,
            sourceAssetName: assetName(cable, 'Parent cable not linked'),
            sourceAssetType: assetType(cable),
            destinationAssetId: dp.id,
            destinationAssetName: assetName(dp),
            cableId: cable?.id,
            cableName: cable ? assetName(cable) : undefined,
            fibreNumber: fibre,
            fibreLabel: `Fibre ${fibre}`,
            allocationType: architecture.toLowerCase().includes('mdu') ? 'mdu' : architecture.toLowerCase().includes('afn') ? 'afn' : 'dp',
            status: linkedHomes.length ? 'allocated' : 'reserved',
            notes: linkedHomes.length
              ? `${linkedHomes.length} home${linkedHomes.length === 1 ? '' : 's'} linked to ${assetName(dp)}.`
              : 'Reserved at DP level. No linked homes found in the current workspace view.',
          },
          rows.length + 1,
        ),
      );
    });
  });

  cables.forEach((cable) => {
    const count = parseFibreCount((cable as any).fibreCount);
    const usedFibres = parseFibreCount((cable as any).usedFibres) || 0;
    if (!count) return;
    if (usedFibres > count) {
      rows.push(
        createRow(
          {
            areaId,
            sourceAssetId: cable.id,
            sourceAssetName: assetName(cable),
            sourceAssetType: assetType(cable),
            destinationAssetName: 'Cable capacity check',
            cableId: cable.id,
            cableName: assetName(cable),
            fibreLabel: `${usedFibres}/${count} fibres used`,
            allocationType: 'reserved',
            status: 'conflict',
            notes: 'Used fibre count is higher than cable fibre count. Check live map cable data before issuing FAS.',
          },
          rows.length + 1,
        ),
      );
    }
  });

  return rows;
}

function summarise(rows: FasAllocationRow[]): FasAllocationSummary {
  const uniqueSources = new Set(rows.map((row) => row.sourceAssetId).filter(Boolean));
  const uniqueDestinations = new Set(rows.map((row) => row.destinationAssetId).filter(Boolean));
  return {
    totalRows: rows.length,
    allocatedFibres: rows.filter((row) => row.status === 'allocated').length,
    reservedFibres: rows.filter((row) => row.status === 'reserved').length,
    missingData: rows.filter((row) => row.status === 'missing_data').length,
    conflicts: rows.filter((row) => row.status === 'conflict').length,
    sourceAssets: uniqueSources.size,
    destinationAssets: uniqueDestinations.size,
  };
}

function buildWarnings(summary: FasAllocationSummary): string[] {
  const warnings: string[] = [];
  if (summary.missingData) warnings.push(`${summary.missingData} FAS row(s) are missing fibre allocation data.`);
  if (summary.conflicts) warnings.push(`${summary.conflicts} FAS row(s) have fibre capacity conflicts.`);
  if (!summary.totalRows) warnings.push('No DP or fibre allocation records were found for this workspace.');
  return warnings;
}

function buildSections(rows: FasAllocationRow[], summary: FasAllocationSummary, warnings: string[]): EngineeringGeneratedDocumentSection[] {
  const previewRows = rows.slice(0, 20).map((row) => {
    const cable = row.cableName ? `${row.cableName} · ` : '';
    return `${row.sequence}. ${cable}${row.fibreLabel} → ${row.destinationAssetName} (${row.status})`;
  });

  return [
    {
      title: 'FAS Summary',
      lines: [
        `Total rows: ${summary.totalRows}`,
        `Allocated fibres: ${summary.allocatedFibres}`,
        `Reserved fibres: ${summary.reservedFibres}`,
        `Missing data: ${summary.missingData}`,
        `Conflicts: ${summary.conflicts}`,
      ],
    },
    {
      title: 'FAS Warnings',
      lines: warnings.length ? warnings : ['No FAS warnings detected.'],
    },
    {
      title: 'FAS Preview',
      lines: previewRows.length ? previewRows : ['No allocation rows available.'],
    },
  ];
}

export function buildFasAllocationFromLiveAssets(input: {
  areaId: string;
  areaName?: string;
  assets: EngineeringAssetSnapshot[];
}): FasAllocationBuildResult {
  const rows = buildRows(input.areaId, input.assets);
  const summary = summarise(rows);
  const warnings = buildWarnings(summary);
  return {
    areaId: input.areaId,
    areaName: input.areaName,
    generatedAt: new Date().toISOString(),
    rows,
    summary,
    warnings,
    sections: buildSections(rows, summary, warnings),
  };
}
