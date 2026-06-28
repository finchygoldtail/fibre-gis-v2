import type {
  EngineeringAreaId,
  EngineeringUserId,
} from './engineeringTypes';
import type {
  BuildJobPackInput,
  JobPackDocumentModel,
  JobPackStatus,
} from './jobPackTypes';
import {
  buildJobPackFromLiveAssets,
} from './jobPackEngine';

const JOB_PACK_STORAGE_KEY = 'alistra-engineering-job-packs:v1';

function canUseBrowserStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readAll(): JobPackDocumentModel[] {
  if (!canUseBrowserStorage()) return [];
  try {
    const raw = window.localStorage.getItem(JOB_PACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JobPackDocumentModel[]) : [];
  } catch {
    return [];
  }
}

function makeRegisterAssetSummary(jobPack: JobPackDocumentModel): JobPackDocumentModel['assets'] {
  // Keep only enough assets for the register counters/detail cards. Do not store
  // geometry, source assets, generated sections or export file content in
  // localStorage because live job packs can easily exceed the browser quota.
  return jobPack.assets.slice(0, 25).map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    status: asset.status,
    installMethod: asset.installMethod,
    fibreCount: asset.fibreCount,
    cableType: asset.cableType,
    geometrySummary: asset.geometrySummary,
    workInstruction: asset.workInstruction,
    validationNotes: asset.validationNotes?.slice(0, 3) || [],
    sourceAsset: {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      status: asset.status,
    } as any,
  }));
}

function compactJobPackForStorage(jobPack: JobPackDocumentModel): JobPackDocumentModel {
  return {
    ...jobPack,
    // Register record only. Full map geometry / documents are regenerated from
    // the live map when Preview, ZIP download or Save Archive is clicked.
    assets: makeRegisterAssetSummary(jobPack),
    sections: [],
    risks: jobPack.risks.slice(0, 40).map((risk) => ({ ...risk })),
    exportFiles: [],
  };
}

function writeAll(jobPacks: JobPackDocumentModel[]): void {
  if (!canUseBrowserStorage()) return;
  try {
    const compact = jobPacks.map(compactJobPackForStorage);
    window.localStorage.setItem(JOB_PACK_STORAGE_KEY, JSON.stringify(compact));
  } catch (error) {
    console.warn('Job pack cache could not be written. The pack was still generated for the current session.', error);
  }
}

export function readLocalJobPacks(areaId?: EngineeringAreaId): JobPackDocumentModel[] {
  const packs = readAll();
  return areaId ? packs.filter((pack) => pack.areaId === areaId) : packs;
}

export function writeLocalJobPacks(jobPacks: JobPackDocumentModel[]): void {
  writeAll(jobPacks);
}

export function createLocalJobPack(input: BuildJobPackInput): JobPackDocumentModel {
  const jobPack = buildJobPackFromLiveAssets(input);
  const existing = readAll();
  writeAll([jobPack, ...existing]);
  return jobPack;
}

export function updateLocalJobPackStatus(
  jobPackId: string,
  status: JobPackStatus,
  userId?: EngineeringUserId,
): JobPackDocumentModel | undefined {
  const existing = readAll();
  let updatedPack: JobPackDocumentModel | undefined;
  const updated = existing.map((pack) => {
    if (pack.id !== jobPackId) return pack;
    updatedPack = {
      ...pack,
      status,
      issuedAt: status === 'issued_to_build_partner' ? new Date().toISOString() : pack.issuedAt,
      issuedBy: status === 'issued_to_build_partner' ? userId : pack.issuedBy,
    };
    return updatedPack;
  });
  writeAll(updated);
  return updatedPack;
}
