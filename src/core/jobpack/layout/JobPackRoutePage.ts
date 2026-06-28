import type { JobPackAssetRecord, JobPackDocumentModel } from '../../engineering/jobPackTypes';
import { renderNorthArrowHtml } from './JobPackFooter';
import { escapeJobPackHtml, renderJobPackTitleBlock } from './JobPackHeader';

export type JobPackPoint = { lat: number; lng: number };
export type JobPackBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export type JobPackMapFeature = {
  id: string;
  name: string;
  type: string;
  status?: string;
  installMethod?: string;
  fibreCount?: string;
  cableType?: string;
  points: JobPackPoint[];
  asset: JobPackAssetRecord;
};

const MAP_WIDTH = 1350;
const MAP_HEIGHT = 1120;
const TILE_SIZE = 256;
const TILE_URL_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function asNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function pointFromPair(value: unknown): JobPackPoint | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const first = asNumber(value[0]);
  const second = asNumber(value[1]);
  if (first === null || second === null) return null;
  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) return { lat: first, lng: second };
  if (Math.abs(second) <= 90 && Math.abs(first) <= 180) return { lat: second, lng: first };
  return null;
}

function pointsFromGeometry(geometry: unknown): JobPackPoint[] {
  const item = geometry as any;
  if (!item || typeof item !== 'object') return [];
  if (item.type === 'Point') {
    const point = pointFromPair(item.coordinates);
    return point ? [point] : [];
  }
  if (item.type === 'LineString' && Array.isArray(item.coordinates)) {
    return item.coordinates.map(pointFromPair).filter(Boolean) as JobPackPoint[];
  }
  if (item.type === 'Polygon' && Array.isArray(item.coordinates)) {
    const ring = item.coordinates.find((candidate: unknown) => Array.isArray(candidate));
    return Array.isArray(ring) ? (ring.map(pointFromPair).filter(Boolean) as JobPackPoint[]) : [];
  }
  return [];
}

function assetType(asset: JobPackAssetRecord): string {
  return String(asset.type || (asset.sourceAsset as any)?.assetType || (asset.sourceAsset as any)?.type || 'asset').toLowerCase();
}

export function jobPackFeatureFromAsset(asset: JobPackAssetRecord): JobPackMapFeature | null {
  const source = asset.sourceAsset as any;
  const direct = asset as any;
  const sourcePoints = pointsFromGeometry(source?.geometry);
  const directPoints = pointsFromGeometry(direct?.geometry);
  const points = sourcePoints.length ? sourcePoints : directPoints;
  if (!points.length) return null;
  return {
    id: asset.id,
    name: asset.name || source?.name || source?.label || asset.id,
    type: assetType(asset),
    status: asset.status,
    installMethod: asset.installMethod,
    fibreCount: asset.fibreCount,
    cableType: asset.cableType,
    points,
    asset,
  };
}

export function boundsForJobPackFeatures(features: JobPackMapFeature[]): JobPackBounds | null {
  const points = features.flatMap((feature) => feature.points);
  if (!points.length) return null;
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  if (minLat === maxLat) {
    minLat -= 0.0005;
    maxLat += 0.0005;
  }
  if (minLng === maxLng) {
    minLng -= 0.0005;
    maxLng += 0.0005;
  }
  const latPad = (maxLat - minLat) * 0.12;
  const lngPad = (maxLng - minLng) * 0.12;
  return { minLat: minLat - latPad, maxLat: maxLat + latPad, minLng: minLng - lngPad, maxLng: maxLng + lngPad };
}

export function expandJobPackBounds(bounds: JobPackBounds, ratio = 0.3): JobPackBounds {
  const latPad = (bounds.maxLat - bounds.minLat) * ratio;
  const lngPad = (bounds.maxLng - bounds.minLng) * ratio;
  return { minLat: bounds.minLat - latPad, maxLat: bounds.maxLat + latPad, minLng: bounds.minLng - lngPad, maxLng: bounds.maxLng + lngPad };
}

export function jobPackFeatureInsideBounds(feature: JobPackMapFeature, bounds: JobPackBounds): boolean {
  return feature.points.some((point) => point.lat >= bounds.minLat && point.lat <= bounds.maxLat && point.lng >= bounds.minLng && point.lng <= bounds.maxLng);
}

function project(point: JobPackPoint, bounds: JobPackBounds): { x: number; y: number } {
  const x = ((point.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * MAP_WIDTH;
  const y = ((bounds.maxLat - point.lat) / (bounds.maxLat - bounds.minLat)) * MAP_HEIGHT;
  return { x: Math.max(8, Math.min(MAP_WIDTH - 8, x)), y: Math.max(8, Math.min(MAP_HEIGHT - 8, y)) };
}

export function lineDistanceMeters(points: JobPackPoint[]): number {
  if (points.length < 2) return 0;
  const earthRadiusMeters = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dLat = toRad(current.lat - previous.lat);
    const dLng = toRad(current.lng - previous.lng);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(previous.lat)) * Math.cos(toRad(current.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    total += earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.round(total);
}

function routeText(feature: JobPackMapFeature): string {
  return `${feature.type} ${feature.cableType || ''} ${feature.installMethod || ''} ${feature.fibreCount || ''} ${feature.name}`.toLowerCase();
}

export function fibreBucket(feature: JobPackMapFeature): '96F' | '48F' | '12F' | 'DROP' | 'OTHER' {
  const text = routeText(feature);
  if (text.includes('drop') || text.includes('spur')) return 'DROP';
  if (text.includes('96f') || /\b96\b/.test(text)) return '96F';
  if (text.includes('48f') || /\b48\b/.test(text)) return '48F';
  if (text.includes('12f') || /\b12\b/.test(text)) return '12F';
  return 'OTHER';
}

function strokeFor(feature: JobPackMapFeature, focused = false): { stroke: string; width: number; dash: string; className: string } {
  const bucket = fibreBucket(feature);
  if (!feature.points || feature.points.length < 2) return { stroke: '#0f172a', width: focused ? 4 : 2, dash: '', className: 'asset-stroke' };
  if (bucket === '96F') return { stroke: '#2563eb', width: focused ? 9 : 5, dash: '18 12', className: 'route-96' };
  if (bucket === '48F') return { stroke: '#16a34a', width: focused ? 8 : 4.5, dash: '16 10', className: 'route-48' };
  if (bucket === '12F') return { stroke: '#7c3aed', width: focused ? 7 : 4, dash: '12 9', className: 'route-12' };
  if (bucket === 'DROP') return { stroke: '#f97316', width: focused ? 5 : 2, dash: '', className: 'route-drop' };
  return { stroke: focused ? '#0f172a' : '#64748b', width: focused ? 7 : 3, dash: focused ? '16 10' : '', className: 'route-other' };
}

function pointSymbol(feature: JobPackMapFeature): { fill: string; stroke: string; radius: number; label: string; showLabel: boolean } {
  const text = `${feature.type} ${feature.name}`.toLowerCase();
  if (text.includes('distribution') || text.includes('dp') || text.includes('cbt') || text.includes('afn') || /\bsb\d+/i.test(feature.name)) return { fill: '#facc15', stroke: '#111827', radius: 9, label: 'DP', showLabel: true };
  if (text.includes('joint') || text.includes('cmj')) return { fill: '#2563eb', stroke: '#111827', radius: 8, label: 'Joint', showLabel: true };
  if (text.includes('chamber') || text.includes('fw')) return { fill: '#e879f9', stroke: '#111827', radius: 8, label: 'Chamber', showLabel: true };
  if (text.includes('pole')) return { fill: '#f8fafc', stroke: '#111827', radius: 6, label: 'Pole', showLabel: false };
  if (text.includes('home') || text.includes('uprn') || text.includes('premise')) return { fill: '#f97316', stroke: '#ea580c', radius: 2.8, label: 'Home', showLabel: false };
  return { fill: '#94a3b8', stroke: '#334155', radius: 5, label: 'Asset', showLabel: false };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lngToTileX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

function chooseTileZoom(bounds: JobPackBounds): number {
  const lngSpan = Math.max(0.00001, bounds.maxLng - bounds.minLng);
  const idealZoom = Math.round(Math.log2((360 * MAP_WIDTH) / (lngSpan * TILE_SIZE))) + 1;
  let zoom = clamp(idealZoom, 15, 19);

  while (zoom > 15) {
    const x1 = Math.floor(lngToTileX(bounds.minLng, zoom));
    const x2 = Math.floor(lngToTileX(bounds.maxLng, zoom));
    const y1 = Math.floor(latToTileY(bounds.maxLat, zoom));
    const y2 = Math.floor(latToTileY(bounds.minLat, zoom));
    const tileCount = (Math.abs(x2 - x1) + 1) * (Math.abs(y2 - y1) + 1);
    if (tileCount <= 80) break;
    zoom -= 1;
  }

  return zoom;
}

function renderBasemapTiles(bounds: JobPackBounds): string {
  const zoom = chooseTileZoom(bounds);
  const minX = lngToTileX(bounds.minLng, zoom);
  const maxX = lngToTileX(bounds.maxLng, zoom);
  const minY = latToTileY(bounds.maxLat, zoom);
  const maxY = latToTileY(bounds.minLat, zoom);
  const startX = Math.floor(minX);
  const endX = Math.floor(maxX);
  const startY = Math.floor(minY);
  const endY = Math.floor(maxY);
  const scaleX = MAP_WIDTH / Math.max(0.000001, maxX - minX);
  const scaleY = MAP_HEIGHT / Math.max(0.000001, maxY - minY);
  const tiles: string[] = [];

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      const imageX = (x - minX) * scaleX;
      const imageY = (y - minY) * scaleY;
      const imageWidth = scaleX + 1;
      const imageHeight = scaleY + 1;
      const href = TILE_URL_TEMPLATE.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
      tiles.push(`<image href="${href}" x="${imageX.toFixed(2)}" y="${imageY.toFixed(2)}" width="${imageWidth.toFixed(2)}" height="${imageHeight.toFixed(2)}" preserveAspectRatio="none" opacity="0.55" />`);
    }
  }

  return tiles.join('');
}

function renderMapBackground(bounds: JobPackBounds): string {
  const lines: string[] = [];
  for (let index = 1; index < 12; index += 1) lines.push(`<line x1="${(MAP_WIDTH / 12) * index}" y1="0" x2="${(MAP_WIDTH / 12) * index}" y2="${MAP_HEIGHT}" class="grid-line" />`);
  for (let index = 1; index < 9; index += 1) lines.push(`<line x1="0" y1="${(MAP_HEIGHT / 9) * index}" x2="${MAP_WIDTH}" y2="${(MAP_HEIGHT / 9) * index}" class="grid-line" />`);
  return `
    <rect x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="#f8fafc" />
    <g class="osm-basemap">${renderBasemapTiles(bounds)}</g>
    <rect x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="#ffffff" opacity="0.18" />
    <rect x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="url(#mapPaper)" opacity="0.22" />
    ${lines.join('')}
    <text x="20" y="${MAP_HEIGHT - 22}" class="coord-label">Live Alistra GIS map coordinates · ${bounds.minLat.toFixed(5)}, ${bounds.minLng.toFixed(5)} to ${bounds.maxLat.toFixed(5)}, ${bounds.maxLng.toFixed(5)}</text>
  `;
}

function renderFeature(feature: JobPackMapFeature, bounds: JobPackBounds, focusedAssetId?: string): string {
  const focused = focusedAssetId === feature.id;
  if (feature.points.length > 1) {
    const projected = feature.points.map((point) => project(point, bounds));
    const d = projected.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const stroke = strokeFor(feature, focused);
    const mid = projected[Math.floor(projected.length / 2)];
    const length = lineDistanceMeters(feature.points);
    const isBoundary = routeText(feature).includes('boundary') || routeText(feature).includes('area') || feature.type.includes('area');
    const label = isBoundary ? '' : `${feature.name}${length ? ` · ${length}m` : ''}`;
    return `
      <path d="${d}" fill="none" stroke="${stroke.stroke}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${stroke.dash}" opacity="${focused ? '1' : isBoundary ? '0.9' : '0.78'}" class="${isBoundary ? 'boundary-route' : stroke.className}" />
      ${focused ? `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${stroke.dash}" opacity="0.9" />` : ''}
      ${label ? `<text x="${mid.x + 6}" y="${mid.y - 8}" class="cable-label ${focused ? 'focused-label' : ''}">${escapeJobPackHtml(label)}</text>` : ''}
    `;
  }
  const point = project(feature.points[0], bounds);
  const symbol = pointSymbol(feature);
  return `
    <circle cx="${point.x}" cy="${point.y}" r="${focused ? symbol.radius + 4 : symbol.radius}" fill="${symbol.fill}" stroke="${symbol.stroke}" stroke-width="${symbol.label === 'Home' ? '1' : focused ? '5' : '3'}" opacity="${symbol.label === 'Home' ? '0.74' : '1'}" />
    ${symbol.showLabel ? `<text x="${point.x + 12}" y="${point.y - 8}" class="asset-label">${escapeJobPackHtml(feature.name)}</text>` : ''}
  `;
}

export function renderEngineeringMapSvg(features: JobPackMapFeature[], bounds: JobPackBounds, focusedAssetId?: string): string {
  const lineFeatures = features.filter((feature) => feature.points.length > 1);
  const pointFeatures = features.filter((feature) => feature.points.length === 1);
  const homes = pointFeatures.filter((feature) => pointSymbol(feature).label === 'Home');
  const nonHomes = pointFeatures.filter((feature) => pointSymbol(feature).label !== 'Home');
  return `<svg viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="Alistra GIS engineering job pack map">
    <defs>
      <pattern id="mapPaper" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="#f8fafc" /><path d="M 48 0 L 0 0 0 48" fill="none" stroke="#e2e8f0" stroke-width="1" /></pattern>
      <filter id="labelGlow" x="-20%" y="-20%" width="140%" height="140%"><feFlood flood-color="white" flood-opacity="0.92" result="flood" /><feComposite in="flood" in2="SourceGraphic" operator="in" result="mask" /><feMorphology in="mask" operator="dilate" radius="3" result="dilated" /><feMerge><feMergeNode in="dilated"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    ${renderMapBackground(bounds)}
    <g>${lineFeatures.map((feature) => renderFeature(feature, bounds, focusedAssetId)).join('')}</g>
    <g>${homes.slice(0, 900).map((feature) => renderFeature(feature, bounds, focusedAssetId)).join('')}</g>
    <g>${nonHomes.map((feature) => renderFeature(feature, bounds, focusedAssetId)).join('')}</g>
  </svg>`;
}

export function renderRouteCaption(feature: JobPackMapFeature | null): string {
  if (!feature) return 'Civil / fibre overview generated from live map data.';
  const length = feature.points.length > 1 ? lineDistanceMeters(feature.points) : 0;
  const first = feature.points[0];
  const last = feature.points[feature.points.length - 1];
  return `Installation / verification of ${escapeJobPackHtml(feature.fibreCount || feature.cableType || 'fibre route')} ${escapeJobPackHtml(feature.name)}<br />Start ${first ? `${first.lat.toFixed(5)}, ${first.lng.toFixed(5)}` : 'live map start'} · End ${last ? `${last.lat.toFixed(5)}, ${last.lng.toFixed(5)}` : 'live map end'}${length ? `<br />Indicative route distance ${length}m. Confirm slack, fixings and labels on site.` : ''}`;
}

export function renderJobPackRoutePage(args: {
  jobPack: JobPackDocumentModel;
  layout: string;
  pageNumber: number;
  pageCount: number;
  features: JobPackMapFeature[];
  bounds: JobPackBounds;
  focusedAssetId?: string;
  caption?: string;
  routeMeta?: string;
}): string {
  return `
    <section class="pdf-page map-page">
      <main class="map-area">
        ${renderEngineeringMapSvg(args.features, args.bounds, args.focusedAssetId)}
        ${renderNorthArrowHtml()}
        <div class="map-caption">${args.caption || 'Generated from the Alistra GIS live map.'}</div>
      </main>
      ${renderJobPackTitleBlock({ jobPack: args.jobPack, layout: args.layout, pageNumber: args.pageNumber, pageCount: args.pageCount, pageType: 'Route Sheet', routeMeta: args.routeMeta })}
    </section>
  `;
}
