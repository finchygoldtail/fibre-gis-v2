import type { EngineeringAssetSnapshot } from '../engineering/engineeringTypes';
import type { BuildPartnerJobPackAssetRecord } from './jobPackModels';

export function text(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  const next = String(value).trim();
  return next || fallback;
}

export function normalise(value: unknown): string {
  return text(value, 'asset').toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
}

export function readAssetName(asset: EngineeringAssetSnapshot): string {
  const item = asset as any;
  return text(
    item.name || item.jointName || item.label || item.cableId || item.cableName || item.assetId || item.id,
    'Unnamed asset',
  );
}

export function readAssetType(asset: EngineeringAssetSnapshot): string {
  const item = asset as any;
  return normalise(item.assetType || item.type || item.jointType || item.cableType || item.homeType || item.kind);
}

export function isPole(record: Pick<BuildPartnerJobPackAssetRecord, 'type'>): boolean {
  return record.type.includes('pole');
}

export function isChamber(record: Pick<BuildPartnerJobPackAssetRecord, 'type'>): boolean {
  return record.type.includes('chamber') || record.type.includes('fw');
}

export function isJoint(record: Pick<BuildPartnerJobPackAssetRecord, 'type'>): boolean {
  return record.type.includes('joint') || record.type.includes('cmj') || record.type.includes('lmj');
}

export function isDp(record: Pick<BuildPartnerJobPackAssetRecord, 'type' | 'name'>): boolean {
  const value = `${record.type} ${record.name}`.toLowerCase();
  return value.includes('distribution') || value.includes('dp') || value.includes('cbt') || value.includes('afn') || value.includes('splitter');
}

export function isCable(record: Pick<BuildPartnerJobPackAssetRecord, 'type' | 'geometryType'>): boolean {
  return record.type.includes('cable') || record.geometryType === 'LineString';
}

export function isHome(record: Pick<BuildPartnerJobPackAssetRecord, 'type'>): boolean {
  return record.type.includes('home') || record.type.includes('sdu') || record.type.includes('mdu') || record.type.includes('flat');
}

export function isArea(record: Pick<BuildPartnerJobPackAssetRecord, 'type' | 'geometryType'>): boolean {
  return record.type.includes('area') || record.type.includes('polygon') || record.geometryType === 'Polygon';
}

export function readGeometryType(asset: EngineeringAssetSnapshot): string {
  const item = asset as any;
  return text(item.geometry?.type || item.typeOfGeometry, 'Unknown');
}

export function readLocation(asset: EngineeringAssetSnapshot): string {
  const item = asset as any;
  const geometry = item.geometry;
  const coordinates = geometry?.coordinates;
  if (geometry?.type === 'Point' && Array.isArray(coordinates) && coordinates.length >= 2) {
    const [lat, lng] = coordinates;
    return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }
  if (typeof item.lat === 'number' && typeof item.lng === 'number') {
    return `${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`;
  }
  if (geometry?.type === 'LineString' && Array.isArray(coordinates)) return `${coordinates.length} route points`;
  if (geometry?.type === 'Polygon' && Array.isArray(coordinates)) return 'Area boundary';
  return 'Location TBC';
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function routeLengthMeters(asset: EngineeringAssetSnapshot): number {
  const item = asset as any;
  const explicit = Number(item.routeLengthMeters || item.lengthMeters || item.distanceMeters || item.properties?.routeLengthMeters || item.properties?.lengthMeters);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const points = item.geometry?.type === 'LineString' ? item.geometry.coordinates : [];
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [lat1, lng1] = points[index - 1];
    const [lat2, lng2] = points[index];
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) continue;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    total += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.round(total);
}

export function readPhotoCount(asset: EngineeringAssetSnapshot): number {
  const item = asset as any;
  const photoSources = [item.photos, item.poleDetails?.photos, item.chamberDetails?.photos, item.dpDetails?.photos, item.properties?.photos];
  return photoSources.reduce((total, source) => total + (Array.isArray(source) ? source.length : 0), 0);
}

export function toJobPackAssetRecord(asset: EngineeringAssetSnapshot): BuildPartnerJobPackAssetRecord {
  const item = asset as any;
  return {
    id: String(item.id || item.assetId || `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    name: readAssetName(asset),
    type: readAssetType(asset),
    status: text(item.status || item.buildStatus || item.dpDetails?.buildStatus || item.properties?.status, 'No status'),
    location: readLocation(asset),
    geometryType: readGeometryType(asset),
    routeLengthMeters: routeLengthMeters(asset) || undefined,
    fibreCount: text(item.fibreCount, undefined as any),
    cableType: text(item.cableType, undefined as any),
    installMethod: text(item.installMethod, undefined as any),
    upstreamAsset: text(item.fromAssetId || item.parentCableId || item.upstreamAssetId, undefined as any),
    downstreamAsset: text(item.toAssetId || item.downstreamAssetId, undefined as any),
    linkedDp: text(item.connectedDpId || item.connectedDP || item.dpId || item.properties?.connectedDpId, undefined as any),
    photoCount: readPhotoCount(asset),
    notes: text(item.notes || item.properties?.notes, undefined as any),
    raw: asset,
  };
}

export function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function csvRows(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
