import {
  EngineeringAssetType,
  EngineeringChangeType,
} from './engineeringTypes';
import type {
  EngineeringAssetSnapshot,
  EngineeringFieldChange,
} from './engineeringTypes';

const NOTE_FIELDS = new Set(['notes', 'note', 'comment', 'comments']);
const PHOTO_FIELDS = new Set(['photos', 'photoUrls', 'photoURLS', 'images']);
const FIBRE_FIELDS = new Set(['fibreAllocation', 'fiberAllocation', 'fibres', 'fibers', 'mappingRows', 'ports', 'splitters']);
const HOME_FIELDS = new Set(['homeIds', 'homes', 'connectedHomes', 'premises', 'uprns']);
const COMMERCIAL_FIELDS = new Set(['commercial', 'commercialDocument', 'commercialStatus', 'auditCommercialStatus']);
const GEOMETRY_FIELDS = new Set(['geometry', 'coordinates', 'lat', 'lng', 'route', 'polyline', 'points']);

export function normaliseAssetList(input?: EngineeringAssetSnapshot | EngineeringAssetSnapshot[] | null): EngineeringAssetSnapshot[] {
  if (!input) return [];
  return Array.isArray(input) ? input : [input];
}

export function detectAssetType(asset?: EngineeringAssetSnapshot | null): EngineeringAssetType {
  const raw = String(asset?.type ?? asset?.assetType ?? asset?.kind ?? '').toLowerCase();
  if (raw.includes('home')) return EngineeringAssetType.Home;
  if (raw.includes('dp') || raw.includes('distribution')) return EngineeringAssetType.DistributionPoint;
  if (raw.includes('pole')) return EngineeringAssetType.Pole;
  if (raw.includes('chamber')) return EngineeringAssetType.Chamber;
  if (raw.includes('joint') || raw.includes('cmj') || raw.includes('midj')) return EngineeringAssetType.Joint;
  if (raw.includes('cable')) return EngineeringAssetType.Cable;
  if (raw.includes('cab')) return EngineeringAssetType.StreetCab;
  if (raw.includes('area') || raw.includes('polygon')) return EngineeringAssetType.Area;
  if (raw.includes('commercial')) return EngineeringAssetType.CommercialDocument;
  return EngineeringAssetType.Unknown;
}

export function getChangedFields(before?: EngineeringAssetSnapshot | null, after?: EngineeringAssetSnapshot | null): EngineeringFieldChange[] {
  if (!before && !after) return [];
  if (!before) return [{ path: '*', before: undefined, after }];
  if (!after) return [{ path: '*', before, after: undefined }];

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: EngineeringFieldChange[] = [];

  keys.forEach((key) => {
    const beforeValue = before[key];
    const afterValue = after[key];
    if (stableStringify(beforeValue) !== stableStringify(afterValue)) {
      changes.push({ path: key, before: beforeValue, after: afterValue });
    }
  });

  return changes;
}

export function classifyFieldChanges(asset: EngineeringAssetSnapshot | undefined, changes: EngineeringFieldChange[]): EngineeringChangeType[] {
  if (!asset && changes.some((change) => change.after)) return [EngineeringChangeType.AssetCreated];
  if (asset && changes.some((change) => change.before && typeof change.after === 'undefined')) return [EngineeringChangeType.AssetDeleted];
  if (!changes.length) return [EngineeringChangeType.NoAction];

  const assetType = detectAssetType(asset);
  const changeTypes = new Set<EngineeringChangeType>();

  for (const change of changes) {
    const topPath = change.path.split('.')[0];
    if (NOTE_FIELDS.has(topPath)) changeTypes.add(EngineeringChangeType.NoteChange);
    else if (PHOTO_FIELDS.has(topPath)) changeTypes.add(EngineeringChangeType.PhotoChange);
    else if (FIBRE_FIELDS.has(topPath)) changeTypes.add(EngineeringChangeType.FibreAllocationChange);
    else if (COMMERCIAL_FIELDS.has(topPath) || assetType === EngineeringAssetType.CommercialDocument) changeTypes.add(EngineeringChangeType.CommercialDocumentChange);
    else if (HOME_FIELDS.has(topPath) || (assetType === EngineeringAssetType.Home && GEOMETRY_FIELDS.has(topPath))) changeTypes.add(EngineeringChangeType.HomeMove);
    else if (GEOMETRY_FIELDS.has(topPath)) {
      if (assetType === EngineeringAssetType.DistributionPoint) changeTypes.add(EngineeringChangeType.DistributionPointMove);
      else if (assetType === EngineeringAssetType.Pole) changeTypes.add(EngineeringChangeType.PoleMove);
      else if (assetType === EngineeringAssetType.Cable) changeTypes.add(EngineeringChangeType.CableRouteChange);
      else changeTypes.add(EngineeringChangeType.AttributeChange);
    } else if (!['updatedAt', 'updatedBy', 'syncRevision'].includes(topPath)) {
      changeTypes.add(EngineeringChangeType.AttributeChange);
    }
  }

  if (!changeTypes.size) return [EngineeringChangeType.NoAction];
  return Array.from(changeTypes);
}

export function choosePrimaryChangeType(changeTypes: EngineeringChangeType[]): EngineeringChangeType {
  const order = [
    EngineeringChangeType.AssetDeleted,
    EngineeringChangeType.CableRouteChange,
    EngineeringChangeType.PoleMove,
    EngineeringChangeType.DistributionPointMove,
    EngineeringChangeType.FibreAllocationChange,
    EngineeringChangeType.HomeMove,
    EngineeringChangeType.AssetCreated,
    EngineeringChangeType.CommercialDocumentChange,
    EngineeringChangeType.PhotoChange,
    EngineeringChangeType.AttributeChange,
    EngineeringChangeType.NoteChange,
    EngineeringChangeType.NoAction,
  ];
  const unique = Array.from(new Set(changeTypes));
  if (unique.length > 1 && unique.some((type) => type !== EngineeringChangeType.NoAction)) {
    const major = order.find((type) => unique.includes(type) && type !== EngineeringChangeType.NoAction);
    return major ?? EngineeringChangeType.MixedChange;
  }
  return unique[0] ?? EngineeringChangeType.NoAction;
}

function stableStringify(value: unknown): string {
  if (typeof value === 'undefined') return 'undefined';
  try {
    return JSON.stringify(value, Object.keys(value as object).sort());
  } catch {
    return String(value);
  }
}
