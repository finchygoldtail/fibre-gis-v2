import type {
  EngineeringAreaId,
  EngineeringAssetId,
  EngineeringAssetSnapshot,
  EngineeringUserId,
} from './engineeringTypes';
import {
  compareEngineeringRevisions,
} from './revisionComparisonEngine';
import type {
  EngineeringRevisionComparisonResult,
} from './revisionComparisonEngine';

export enum EngineeringTwinSnapshotStatus {
  Draft = 'draft',
  Review = 'review',
  Approved = 'approved',
  Published = 'published',
  Superseded = 'superseded',
}

export interface EngineeringTwinSnapshot {
  id: string;
  areaId: EngineeringAreaId;
  areaName?: string;
  revisionNumber: string;
  status: EngineeringTwinSnapshotStatus;
  reason: string;
  createdAt: string;
  createdBy?: EngineeringUserId;
  assetCount: number;
  assetIds: EngineeringAssetId[];
  assets: EngineeringAssetSnapshot[];
  metadata: {
    poleCount: number;
    dpCount: number;
    chamberCount: number;
    jointCount: number;
    cableCount: number;
    homeCount: number;
    otherCount: number;
  };
}

export interface EngineeringTwinState {
  areaId: EngineeringAreaId;
  areaName?: string;
  currentSnapshotId?: string;
  publishedSnapshotId?: string;
  snapshots: EngineeringTwinSnapshot[];
}

export interface EngineeringTwinComparison {
  fromSnapshot?: EngineeringTwinSnapshot;
  toSnapshot?: EngineeringTwinSnapshot;
  result: EngineeringRevisionComparisonResult;
}

const STORAGE_PREFIX = 'alistra-engineering-digital-twin:';

function createTwinId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getStorageKey(areaId: EngineeringAreaId): string {
  return `${STORAGE_PREFIX}${areaId}`;
}

function normaliseAssetType(type: unknown): string {
  return String(type || '').toLowerCase().replace(/\s+/g, '_');
}

function getAssetId(asset: EngineeringAssetSnapshot): EngineeringAssetId {
  return String(asset.id || createTwinId('asset'));
}

function getAssetName(asset: EngineeringAssetSnapshot): string | undefined {
  const anyAsset = asset as any;
  return anyAsset.name || anyAsset.label || anyAsset.title || anyAsset.properties?.name || anyAsset.properties?.label;
}

export function toEngineeringAssetSnapshot(asset: unknown, areaId?: EngineeringAreaId): EngineeringAssetSnapshot {
  const source = (asset || {}) as any;
  return {
    ...source,
    id: String(source.id || source.assetId || createTwinId('asset')),
    areaId: source.areaId || source.areaKey || source.projectAreaId || areaId,
    type: source.type || source.assetType || source.kind || 'unknown',
    name: getAssetName(source),
    status: source.status || source.assetStatus || source.properties?.status,
    geometry: source.geometry,
    coordinates: source.coordinates || source.position || source.latLng || source.points,
    fibreAllocation: source.fibreAllocation || source.fibreAllocations || source.allocation,
    fibres: source.fibres || source.fibreRows || source.mappingRows,
    homes: source.homes || source.connectedHomes || source.homeIds,
    photos: source.photos || source.photoUrls || source.images,
    notes: source.notes || source.description || source.comments,
    commercial: source.commercial || source.commercialData || source.paymentBlocker,
    updatedAt: source.updatedAt || source.modifiedAt,
    updatedBy: source.updatedBy || source.modifiedBy,
  };
}

export function summariseTwinAssets(assets: EngineeringAssetSnapshot[]): EngineeringTwinSnapshot['metadata'] {
  return assets.reduce<EngineeringTwinSnapshot['metadata']>((summary, asset) => {
    const type = normaliseAssetType(asset.type);
    if (type.includes('pole')) summary.poleCount += 1;
    else if (type.includes('distribution') || type === 'dp' || type.includes('cbt') || type.includes('afn')) summary.dpCount += 1;
    else if (type.includes('chamber')) summary.chamberCount += 1;
    else if (type.includes('joint') || type.includes('cmj') || type.includes('lmj')) summary.jointCount += 1;
    else if (type.includes('cable') || type.includes('route')) summary.cableCount += 1;
    else if (type.includes('home') || type.includes('premise') || type.includes('address')) summary.homeCount += 1;
    else summary.otherCount += 1;
    return summary;
  }, {
    poleCount: 0,
    dpCount: 0,
    chamberCount: 0,
    jointCount: 0,
    cableCount: 0,
    homeCount: 0,
    otherCount: 0,
  });
}

export function createEngineeringTwinSnapshot(input: {
  areaId: EngineeringAreaId;
  areaName?: string;
  assets: unknown[];
  revisionNumber?: string;
  status?: EngineeringTwinSnapshotStatus;
  reason?: string;
  createdBy?: EngineeringUserId;
}): EngineeringTwinSnapshot {
  const snapshots = input.assets.map((asset) => toEngineeringAssetSnapshot(asset, input.areaId));
  const revisionNumber = input.revisionNumber || `TWIN-${new Date().toISOString().slice(0, 10)}-${String(Date.now()).slice(-5)}`;

  return {
    id: createTwinId('eng_twin_snapshot'),
    areaId: input.areaId,
    areaName: input.areaName,
    revisionNumber,
    status: input.status || EngineeringTwinSnapshotStatus.Draft,
    reason: input.reason || 'Live map engineering snapshot captured.',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    assetCount: snapshots.length,
    assetIds: snapshots.map(getAssetId),
    assets: snapshots,
    metadata: summariseTwinAssets(snapshots),
  };
}

export function readLocalEngineeringTwin(areaId: EngineeringAreaId, areaName?: string): EngineeringTwinState {
  if (typeof window === 'undefined') return { areaId, areaName, snapshots: [] };
  try {
    const saved = window.localStorage.getItem(getStorageKey(areaId));
    if (!saved) return { areaId, areaName, snapshots: [] };
    const parsed = JSON.parse(saved) as EngineeringTwinState;
    return { ...parsed, areaId, areaName: parsed.areaName || areaName, snapshots: parsed.snapshots || [] };
  } catch {
    return { areaId, areaName, snapshots: [] };
  }
}

export function writeLocalEngineeringTwin(state: EngineeringTwinState): EngineeringTwinState {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(getStorageKey(state.areaId), JSON.stringify(state));
      window.dispatchEvent(new StorageEvent('storage', { key: getStorageKey(state.areaId) }));
    } catch {
      // Local-only engineering twin cache; do not block the app if storage is unavailable.
    }
  }
  return state;
}

export function addLocalEngineeringTwinSnapshot(snapshot: EngineeringTwinSnapshot): EngineeringTwinState {
  const current = readLocalEngineeringTwin(snapshot.areaId, snapshot.areaName);
  const snapshots = [snapshot, ...current.snapshots.filter((item) => item.id !== snapshot.id)].slice(0, 25);
  return writeLocalEngineeringTwin({
    ...current,
    areaId: snapshot.areaId,
    areaName: snapshot.areaName || current.areaName,
    currentSnapshotId: snapshot.id,
    publishedSnapshotId: snapshot.status === EngineeringTwinSnapshotStatus.Published ? snapshot.id : current.publishedSnapshotId,
    snapshots,
  });
}

export function publishEngineeringTwinSnapshot(state: EngineeringTwinState, snapshotId: string): EngineeringTwinState {
  const snapshots = state.snapshots.map((snapshot) => {
    if (snapshot.id === snapshotId) return { ...snapshot, status: EngineeringTwinSnapshotStatus.Published };
    if (snapshot.status === EngineeringTwinSnapshotStatus.Published) return { ...snapshot, status: EngineeringTwinSnapshotStatus.Superseded };
    return snapshot;
  });

  return writeLocalEngineeringTwin({
    ...state,
    currentSnapshotId: snapshotId,
    publishedSnapshotId: snapshotId,
    snapshots,
  });
}

export function compareEngineeringTwinSnapshots(
  fromSnapshot: EngineeringTwinSnapshot | undefined,
  toSnapshot: EngineeringTwinSnapshot | undefined,
): EngineeringTwinComparison {
  return {
    fromSnapshot,
    toSnapshot,
    result: compareEngineeringRevisions({
      previousRevision: fromSnapshot ? {
        id: fromSnapshot.id,
        areaId: fromSnapshot.areaId,
        revisionNumber: fromSnapshot.revisionNumber,
        createdAt: fromSnapshot.createdAt,
        createdBy: fromSnapshot.createdBy,
        reason: fromSnapshot.reason,
        affectedAssets: fromSnapshot.assetIds,
        affectedDocuments: [],
        status: 'issued' as any,
        summary: fromSnapshot.reason,
      } : undefined,
      nextRevision: toSnapshot ? {
        id: toSnapshot.id,
        areaId: toSnapshot.areaId,
        revisionNumber: toSnapshot.revisionNumber,
        createdAt: toSnapshot.createdAt,
        createdBy: toSnapshot.createdBy,
        reason: toSnapshot.reason,
        affectedAssets: toSnapshot.assetIds,
        affectedDocuments: [],
        status: 'draft' as any,
        summary: toSnapshot.reason,
      } : undefined,
      beforeAssets: fromSnapshot?.assets || [],
      afterAssets: toSnapshot?.assets || [],
    }),
  };
}

export function getLatestEngineeringTwinSnapshot(state: EngineeringTwinState): EngineeringTwinSnapshot | undefined {
  return state.snapshots[0];
}

export function getPublishedEngineeringTwinSnapshot(state: EngineeringTwinState): EngineeringTwinSnapshot | undefined {
  return state.snapshots.find((snapshot) => snapshot.id === state.publishedSnapshotId)
    || state.snapshots.find((snapshot) => snapshot.status === EngineeringTwinSnapshotStatus.Published);
}
