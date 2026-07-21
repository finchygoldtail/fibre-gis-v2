import type { JobPackDraft, JobPackDraftAsset, JobPackRouteDraft } from "./jobPackTypes";

const sheetWidth = 1400;
const sheetHeight = 900;
const mapWidth = 1215;
const panelX = 1220;
const mapPadding = 36;

type Bounds = { minLng: number; maxLng: number; minLat: number; maxLat: number };
type Point = [number, number];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function coordinates(asset: JobPackDraftAsset): Point[] {
  const geometry = asset.geometry;
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString") return geometry.coordinates;
  return geometry.coordinates.flat();
}

function boundsFor(assets: JobPackDraftAsset[]): Bounds {
  const points = assets.flatMap(coordinates);
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

function expandBounds(bounds: Bounds, ratio = 0.08, minimum = 0.00002): Bounds {
  const lngPad = Math.max((bounds.maxLng - bounds.minLng) * ratio, minimum);
  const latPad = Math.max((bounds.maxLat - bounds.minLat) * ratio, minimum);
  return {
    minLng: bounds.minLng - lngPad,
    maxLng: bounds.maxLng + lngPad,
    minLat: bounds.minLat - latPad,
    maxLat: bounds.maxLat + latPad,
  };
}

function project(point: Point, bounds: Bounds): Point {
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.00001);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.00001);
  const x = mapPadding + ((point[0] - bounds.minLng) / lngSpan) * (mapWidth - mapPadding * 2);
  const y = sheetHeight - mapPadding - ((point[1] - bounds.minLat) / latSpan) * (sheetHeight - mapPadding * 2);
  return [x, y];
}

function pathPoints(points: Point[]): string {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return distance(point, [start[0] + t * dx, start[1] + t * dy]);
}

function distanceToRoute(point: Point, route: JobPackDraftAsset): number {
  const points = coordinates(route);
  if (points.length < 2) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, pointToSegmentDistance(point, points[index - 1], points[index]));
  }
  return best;
}

function compact(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sourceValue(asset: JobPackDraftAsset, keys: string[]): string {
  const item = (asset.sourceAsset || {}) as any;
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current?.[part], item);
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function cablePiaLabel(asset: JobPackDraftAsset): string {
  return sourceValue(asset, [
    "piaNoiNumber",
    "piaNOINumber",
    "piaNoi",
    "piaNOI",
    "properties.piaNoiNumber",
    "properties.piaNOINumber",
    "properties.piaNoi",
  ]);
}

function cableLabel(asset: JobPackDraftAsset): string {
  const pia = cablePiaLabel(asset);
  const ref = sourceValue(asset, ["cableId", "cableName", "name", "label"]) || asset.name;
  return [pia ? `PIA ${pia}` : ref, asset.fibreCount].filter(Boolean).join(" / ");
}

function routeReferenceTokens(route: JobPackDraftAsset): Set<string> {
  const item = (route.sourceAsset || {}) as any;
  return new Set(
    [
      route.id,
      route.name,
      route.fibreCount,
      item.id,
      item.assetId,
      item.cableId,
      item.cableName,
      item.name,
      item.label,
      item.piaNoiNumber,
      item.piaNOINumber,
      item.piaNoi,
      item.piaNOI,
      item.properties?.piaNoiNumber,
      item.properties?.piaNOINumber,
      item.properties?.piaNoi,
    ].map(compact).filter(Boolean),
  );
}

function assetReferenceTokens(asset: JobPackDraftAsset): Set<string> {
  const item = (asset.sourceAsset || {}) as any;
  return new Set(
    [
      asset.id,
      asset.name,
      item.id,
      item.assetId,
      item.name,
      item.label,
      item.cableId,
      item.cableName,
      item.throughCableId,
      item.downstreamCableId,
      item.parentCableId,
      item.feedCableId,
      item.dpDetails?.autoFibrePlan?.throughCableId,
      item.dpDetails?.afnDetails?.throughCableId,
      item.dpDetails?.mduDetails?.throughCableId,
      item.piaNoiNumber,
      item.piaNOINumber,
      item.piaNoi,
      item.piaNOI,
      item.properties?.piaNoiNumber,
      item.properties?.piaNOINumber,
      item.properties?.piaNoi,
    ].map(compact).filter(Boolean),
  );
}

function isPointRelatedToSelectedRoutes(asset: JobPackDraftAsset, selectedRoutes: JobPackDraftAsset[], bounds: Bounds): boolean {
  if (!selectedRoutes.length || asset.geometry.type !== "Point") return false;
  const assetPoint = coordinates(asset)[0];
  const routeTokens = new Set(selectedRoutes.flatMap((route) => Array.from(routeReferenceTokens(route))));
  const assetTokens = assetReferenceTokens(asset);
  if (Array.from(assetTokens).some((token) => routeTokens.has(token))) return true;

  const tolerance = Math.max(bounds.maxLng - bounds.minLng, bounds.maxLat - bounds.minLat) * 0.015;
  return selectedRoutes.some((route) => distanceToRoute(assetPoint, route) <= tolerance);
}

function routeColour(asset: JobPackDraftAsset): string {
  if (asset.cableType === "Drop") return "#22c55e";
  if (asset.fibreCount === "96F") return "#e60000";
  if (asset.fibreCount === "48F") return "#0ea5e9";
  if (asset.fibreCount === "36F") return "#22c55e";
  if (asset.fibreCount === "24F") return "#f97316";
  if (asset.fibreCount === "12F") return "#ff00b8";
  return "#111827";
}

function renderBaseContext(bounds: Bounds): string {
  const roadLines = [
    [[0.04, 0.36], [0.18, 0.34], [0.34, 0.38], [0.52, 0.35], [0.72, 0.37], [0.94, 0.43]],
    [[0.08, 0.52], [0.24, 0.50], [0.40, 0.53], [0.58, 0.51], [0.78, 0.56], [0.98, 0.55]],
    [[0.10, 0.68], [0.30, 0.64], [0.48, 0.67], [0.66, 0.64], [0.84, 0.69], [0.98, 0.66]],
    [[0.20, 0.28], [0.22, 0.74]],
    [[0.42, 0.25], [0.44, 0.76]],
    [[0.66, 0.30], [0.68, 0.77]],
    [[0.88, 0.34], [0.90, 0.78]],
  ];
  const roads = roadLines.map((line) => {
    const points = line.map(([x, y]) => [mapPadding + x * (mapWidth - mapPadding * 2), mapPadding + y * (sheetHeight - mapPadding * 2)] as Point);
    const path = pathPoints(points);
    return `<polyline points="${path}" fill="none" stroke="#c9cdca" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="${path}" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");
  const grid = Array.from({ length: 12 }, (_, index) => {
    const x = mapPadding + index * ((mapWidth - mapPadding * 2) / 11);
    return `<line x1="${x.toFixed(1)}" y1="${mapPadding}" x2="${x.toFixed(1)}" y2="${sheetHeight - mapPadding}" stroke="#e7e5df" stroke-width="1"/>`;
  }).join("");
  const _bounds = bounds;
  void _bounds;
  return `
    <rect x="0" y="0" width="${mapWidth}" height="${sheetHeight}" fill="#f6f7f1"/>
    <path d="M0 0 H360 L300 130 L0 210 Z" fill="#dff4dc"/>
    <path d="M760 0 H${mapWidth} V190 C1060 150 1000 220 860 190 Z" fill="#dff4dc"/>
    <path d="M0 790 C300 760 520 850 760 815 C930 790 1050 820 ${mapWidth} 780 V${sheetHeight} H0 Z" fill="#cdeef7"/>
    ${grid}
    ${roads}`;
}

function renderBoundary(asset: JobPackDraftAsset, bounds: Bounds): string {
  const points = coordinates(asset).map((point) => project(point, bounds));
  return `<polygon points="${pathPoints(points)}" fill="rgba(255,255,255,0.18)" stroke="#858585" stroke-width="6" stroke-linejoin="round"/>`;
}

function routeLabelPlacement(points: Point[]): { point: Point; angle: number } | null {
  if (points.length < 2) return null;
  const lengths = points.slice(1).map((point, index) => distance(points[index], point));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  const target = total / 2;
  let travelled = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segment = lengths[index - 1] || 0;
    if (travelled + segment >= target || index === points.length - 1) {
      const ratio = segment > 0 ? Math.max(0, Math.min(1, (target - travelled) / segment)) : 0;
      const point: Point = [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
      let angle = Math.atan2(end[1] - start[1], end[0] - start[0]) * (180 / Math.PI);
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      return { point, angle };
    }
    travelled += segment;
  }

  return null;
}

function renderRoute(asset: JobPackDraftAsset, bounds: Bounds, selected: boolean, context: boolean): string {
  const points = coordinates(asset).map((point) => project(point, bounds));
  const stroke = selected ? routeColour(asset) : context ? "#111827" : routeColour(asset);
  const width = selected ? 7 : context ? 3 : 5;
  const dash = selected || !context ? "" : ` stroke-dasharray="7 7"`;
  const placement = routeLabelPlacement(points);
  const label = selected ? cableLabel(asset) : "";
  const labelWidth = Math.min(230, Math.max(56, label.length * 6.2));
  return `<polyline points="${pathPoints(points)}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash}/>
    ${selected ? points.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#ffd60a" stroke="#1f2937" stroke-width="1.5"/>`).join("") : ""}
    ${selected && label && placement ? `<g transform="translate(${placement.point[0].toFixed(1)} ${placement.point[1].toFixed(1)}) rotate(${placement.angle.toFixed(1)})"><rect x="${(-labelWidth / 2).toFixed(1)}" y="-18" width="${labelWidth.toFixed(1)}" height="16" rx="8" fill="#ffffff" fill-opacity="0.9" stroke="#111827" stroke-width="1"/><text x="0" y="-6" text-anchor="middle" font-family="Arial" font-size="9" font-weight="700" fill="#111827">${escapeXml(label).slice(0, 34)}</text></g>` : ""}`;
}

function renderHome(asset: JobPackDraftAsset, bounds: Bounds, muted: boolean): string {
  const [x, y] = project(coordinates(asset)[0], bounds);
  const fill = muted ? "#f1d5b1" : "#f7c98f";
  return `<rect x="${(x - 5).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="10" height="8" fill="${fill}" stroke="#bd9b72" stroke-width="0.8"/>`;
}

function renderPoint(asset: JobPackDraftAsset, bounds: Bounds): string {
  const [x, y] = project(coordinates(asset)[0], bounds);
  if (asset.group === "distributionPoint") {
    const label = asset.name || "DP";
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#ffd60a" stroke="#111827" stroke-width="2"/><rect x="${(x + 8).toFixed(1)}" y="${(y - 16).toFixed(1)}" width="${Math.min(170, Math.max(22, label.length * 5.5)).toFixed(1)}" height="13" rx="3" fill="#ffffff" stroke="#111827" stroke-width="0.8"/><text x="${(x + 11).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-family="Arial" font-size="8" font-weight="700" fill="#111827">${escapeXml(label).slice(0, 30)}</text>`;
  }
  if (asset.group === "streetCab") {
    const label = asset.name || "SB";
    return `<rect x="${(x - 6).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="12" height="12" rx="2" fill="#38bdf8" stroke="#111827" stroke-width="1.8"/><rect x="${(x + 8).toFixed(1)}" y="${(y - 16).toFixed(1)}" width="${Math.min(160, Math.max(22, label.length * 5.5)).toFixed(1)}" height="13" rx="3" fill="#ffffff" stroke="#111827" stroke-width="0.8"/><text x="${(x + 11).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-family="Arial" font-size="8" font-weight="700" fill="#111827">${escapeXml(label).slice(0, 28)}</text>`;
  }
  if (asset.group === "joint") {
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#111827" stroke="#ffffff" stroke-width="1.5"/>`;
  }
  if (asset.group === "chamber") {
    return `<rect x="${(x - 5).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="10" height="10" fill="#7a7a7a" stroke="#111827" stroke-width="1.5"/>`;
  }
  if (asset.group === "pole") {
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#ffffff" stroke="#111827" stroke-width="1.8"/>`;
  }
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#111827"/>`;
}

function renderInferredDrops(assets: JobPackDraftAsset[], bounds: Bounds, muted: boolean): string {
  const dps = assets.filter((asset) => asset.group === "distributionPoint").map((asset) => project(coordinates(asset)[0], bounds));
  if (!dps.length) return "";
  const homes = assets.filter((asset) => asset.group === "home");
  return homes.map((home, index) => {
    const homePoint = project(coordinates(home)[0], bounds);
    const nearest = dps.reduce((best, candidate) => distance(homePoint, candidate) < distance(homePoint, best) ? candidate : best, dps[0]);
    const colour = muted ? "#c8d9ca" : index % 3 === 0 ? "#ff7a1a" : index % 3 === 1 ? "#13a865" : "#ff35b8";
    return `<line x1="${nearest[0].toFixed(1)}" y1="${nearest[1].toFixed(1)}" x2="${homePoint[0].toFixed(1)}" y2="${homePoint[1].toFixed(1)}" stroke="${colour}" stroke-width="${muted ? 1 : 1.8}" opacity="${muted ? 0.42 : 0.75}"/>`;
  }).join("");
}

function renderLegend(): string {
  const rows = [
    ["Project Boundary", "#858585", "line"],
    ["Planned Route", "#e60000", "line"],
    ["Route Context", "#111827", "dash"],
    ["DP / Closure", "#ffd60a", "circle"],
    ["SB / Street Cab", "#38bdf8", "rect"],
    ["Home / Premises", "#f7c98f", "rect"],
    ["Drop Fibre", "#13a865", "line"],
    ["Chamber", "#7a7a7a", "rect"],
    ["Pole", "#ffffff", "circle"],
  ];
  return rows.map(([label, colour, shape], index) => {
    const y = 390 + index * 34;
    const swatch = shape === "circle"
      ? `<circle cx="${panelX + 20}" cy="${y - 5}" r="7" fill="${colour}" stroke="#111827" stroke-width="1.5"/>`
      : shape === "rect"
        ? `<rect x="${panelX + 12}" y="${y - 13}" width="16" height="16" fill="${colour}" stroke="#111827" stroke-width="1.2"/>`
        : `<line x1="${panelX + 8}" y1="${y - 5}" x2="${panelX + 34}" y2="${y - 5}" stroke="${colour}" stroke-width="4" ${shape === "dash" ? 'stroke-dasharray="6 5"' : ""}/>`;
    return `${swatch}<text x="${panelX + 43}" y="${y}" font-family="Arial" font-size="13" fill="#111827">${escapeXml(label)}</text>`;
  }).join("");
}

function renderSidePanel(draft: JobPackDraft, title: string): string {
  const projectCode = draft.packNumber.replace(/^AL-/, "").replace(/-DRAFT.*$/, "") || draft.areaName;
  return `
    <rect x="${panelX}" y="0" width="${sheetWidth - panelX}" height="${sheetHeight}" fill="#ffffff" stroke="#111827" stroke-width="2"/>
    <rect x="${panelX}" y="0" width="${sheetWidth - panelX}" height="46" fill="#f8fafc" stroke="#111827" stroke-width="1"/>
    <text x="${panelX + 26}" y="30" font-family="Arial" font-size="17" font-weight="700" fill="#111827">PROJECT INFORMATION</text>
    ${infoBox(52, "PROJECT CODE:", projectCode)}
    ${infoBox(112, "AREA:", draft.areaName)}
    ${infoBox(172, "LAYOUT:", title)}
    ${infoBox(232, "PLANNER:", "Alistra GIS")}
    ${infoBox(292, "DATE:", new Date(draft.generatedAt).toLocaleDateString())}
    <rect x="${panelX}" y="360" width="${sheetWidth - panelX}" height="310" fill="#ffffff" stroke="#111827" stroke-width="1"/>
    <text x="${panelX + 55}" y="382" font-family="Arial" font-size="17" font-weight="700" fill="#111827">MAP LEGEND</text>
    ${renderLegend()}
    <rect x="${panelX}" y="690" width="${sheetWidth - panelX}" height="145" fill="#ffffff" stroke="#111827" stroke-width="1"/>
    <text x="${panelX + 36}" y="754" font-family="Arial" font-size="48" font-weight="700" fill="#003B7A">ALISTRA</text>
    <text x="${panelX + 62}" y="806" font-family="Arial" font-size="48" font-weight="700" fill="#0073B7">GIS</text>
    <rect x="${panelX}" y="842" width="${sheetWidth - panelX}" height="58" fill="#ffffff" stroke="#111827" stroke-width="1"/>
    <text x="${panelX + 68}" y="866" font-family="Arial" font-size="17" font-weight="700" fill="#111827">PAGE</text>
    <text x="${panelX + 62}" y="890" font-family="Arial" font-size="15" fill="#111827">Draft</text>`;
}

function infoBox(y: number, label: string, value: string): string {
  return `<rect x="${panelX}" y="${y}" width="${sheetWidth - panelX}" height="54" fill="#ffffff" stroke="#111827" stroke-width="1"/>
    <text x="${panelX + 18}" y="${y + 20}" font-family="Arial" font-size="14" font-weight="700" fill="#111827">${escapeXml(label)}</text>
    <text x="${panelX + 18}" y="${y + 42}" font-family="Arial" font-size="13" fill="#111827">${escapeXml(value).slice(0, 22)}</text>`;
}

export function renderJobPackOverviewSvg(draft: JobPackDraft): string {
  return renderJobPackMapSvg(draft, draft.assets, `${draft.areaName} Overview`);
}

export function renderJobPackRouteSvg(draft: JobPackDraft, route: JobPackRouteDraft): string {
  return renderJobPackMapSvg(draft, draft.assets, route.title, route.fibreCount);
}

function renderJobPackMapSvg(draft: JobPackDraft, assets: JobPackDraftAsset[], title: string, routeFilter?: string): string {
  const drawable = assets.filter((asset) => coordinates(asset).length);
  if (!drawable.length) {
    return `<svg viewBox="0 0 ${sheetWidth} ${sheetHeight}" role="img" aria-label="${escapeXml(title)}" xmlns="http://www.w3.org/2000/svg"><rect width="${sheetWidth}" height="${sheetHeight}" fill="#ffffff"/><text x="40" y="70" fill="#111827" font-size="28">No mappable assets</text>${renderSidePanel(draft, title)}</svg>`;
  }
  const selectedRoutes = drawable.filter((asset) => asset.group === "route" && (!routeFilter || asset.fibreCount === routeFilter));
  const contextRoutes = routeFilter ? drawable.filter((asset) => asset.group === "route" && asset.fibreCount !== routeFilter) : [];
  const nonRouteAssets = drawable.filter((asset) => asset.group !== "route");
  const muted = Boolean(routeFilter);
  const routePagePointGroups = new Set(["distributionPoint", "streetCab", "joint", "chamber", "pole", "home"]);
  const seedBounds = routeFilter && selectedRoutes.length
    ? expandBounds(boundsFor(selectedRoutes), 0.28, 0.00008)
    : expandBounds(boundsFor(drawable));
  const relatedRoutePoints = routeFilter
    ? nonRouteAssets
      .filter((asset) => routePagePointGroups.has(asset.group))
      .filter((asset) => isPointRelatedToSelectedRoutes(asset, selectedRoutes, seedBounds))
    : [];
  const bounds = routeFilter && selectedRoutes.length
    ? expandBounds(boundsFor([...selectedRoutes, ...contextRoutes, ...relatedRoutePoints]), 0.22, 0.00008)
    : seedBounds;

  const boundaries = nonRouteAssets.filter((asset) => asset.group === "boundary").map((asset) => renderBoundary(asset, bounds)).join("");
  const homes = nonRouteAssets.filter((asset) => asset.group === "home").map((asset) => renderHome(asset, bounds, muted)).join("");
  const points = nonRouteAssets
    .filter((asset) => !["boundary", "home"].includes(asset.group))
    .filter((asset) => !routeFilter || !routePagePointGroups.has(asset.group) || relatedRoutePoints.includes(asset))
    .map((asset) => renderPoint(asset, bounds))
    .join("");
  const context = contextRoutes.map((asset) => renderRoute(asset, bounds, false, true)).join("");
  const selected = selectedRoutes.map((asset) => renderRoute(asset, bounds, true, false)).join("");

  return `<svg viewBox="0 0 ${sheetWidth} ${sheetHeight}" role="img" aria-label="${escapeXml(title)}" xmlns="http://www.w3.org/2000/svg">
    ${renderBaseContext(bounds)}
    ${boundaries}
    ${renderInferredDrops(nonRouteAssets, bounds, muted)}
    ${homes}
    ${context}
    ${selected}
    ${points}
    <rect x="0" y="0" width="${mapWidth}" height="${sheetHeight}" fill="none" stroke="#111827" stroke-width="2"/>
    <text x="24" y="32" font-family="Arial" font-size="22" font-weight="700" fill="#111827">ALISTRA GIS - ${escapeXml(title)}</text>
    <text x="24" y="${sheetHeight - 18}" font-family="Arial" font-size="12" fill="#334155">Homes plotted without UPRN labels. Live map draft for engineering review before issue.</text>
    ${renderSidePanel(draft, title)}
  </svg>`;
}
