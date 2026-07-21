import type { JobPackDocumentModel } from '../../engineering/jobPackTypes';
import { escapeJobPackHtml, renderJobPackTitleBlock } from './JobPackHeader';
import { renderJobPackContentsPage, type JobPackContentsItem } from './JobPackContents';
import { renderJobPackOverviewPage } from './JobPackOverviewPage';
import {
  boundsForJobPackFeatures,
  expandJobPackBounds,
  fibreBucket,
  jobPackFeatureFromAsset,
  jobPackFeatureInsideBounds,
  renderJobPackRoutePage,
  renderRouteCaption,
  type JobPackMapFeature,
} from './JobPackRoutePage';
import { buildFasRows, renderAssetSchedulePage, renderFasPage, renderRiskPage } from './JobPackSchedulePage';

const PAGE_WIDTH = 1600;
const PAGE_HEIGHT = 1120;
const MAP_WIDTH = 1350;
const SIDE_WIDTH = PAGE_WIDTH - MAP_WIDTH;

function coverPage(jobPack: JobPackDocumentModel, pageNumber: number, pageCount: number): string {
  return `
    <section class="pdf-page text-page cover-page">
      <main class="cover-area">
        <div class="cover-brand"><span>Alistra</span><strong>GIS</strong></div>
        <div class="cover-kicker">Engineering Delivery · Map First Job Pack</div>
        <h1>${escapeJobPackHtml(jobPack.areaName || jobPack.areaId)}</h1>
        <h2>${escapeJobPackHtml(jobPack.jobPackNumber)}</h2>
        <div class="cover-grid">
          <div><span>Revision</span><strong>${escapeJobPackHtml(jobPack.revisionNumber || 'LIVE')}</strong></div>
          <div><span>Generated</span><strong>${escapeJobPackHtml(jobPack.generatedAt.slice(0, 10))}</strong></div>
          <div><span>Assets</span><strong>${jobPack.summary.totalAssets}</strong></div>
          <div><span>DPs</span><strong>${jobPack.summary.distributionPoints}</strong></div>
          <div><span>Cables</span><strong>${jobPack.summary.cables}</strong></div>
          <div><span>Risks</span><strong>${jobPack.summary.warnings + jobPack.summary.blockers}</strong></div>
        </div>
        <p class="cover-note">Generated from the live Alistra GIS saved map. Homes are plotted as dots only. No UPRN labels are printed on map sheets.</p>
      </main>
      ${renderJobPackTitleBlock({ jobPack, layout: 'Cover', pageNumber, pageCount, pageType: 'Cover Sheet' })}
    </section>
  `;
}

function sectionNotesPage(jobPack: JobPackDocumentModel, pageNumber: number, pageCount: number): string {
  const sections = jobPack.sections.filter((section) => ['work_instructions', 'quality_checks', 'overview'].includes(section.type)).slice(0, 8);
  return `
    <section class="pdf-page text-page">
      <main class="text-area">
        <div class="document-title-block"><div class="document-eyebrow">Construction Notes / QA</div><h1>Risk, Notes and QA</h1><p>Complete these checks before build handover, walk-off or archive.</p></div>
        <div class="note-grid">
          ${sections.map((section) => `<div class="note-card"><h3>${escapeJobPackHtml(section.title)}</h3><ul>${section.lines.slice(0, 9).map((line) => `<li>${escapeJobPackHtml(line)}</li>`).join('')}</ul></div>`).join('')}
          ${sections.length ? '' : '<div class="note-card"><h3>QA</h3><ul><li>Confirm route, labels, PIA references and photo evidence.</li><li>Confirm FAS matches live map before issue.</li></ul></div>'}
        </div>
      </main>
      ${renderJobPackTitleBlock({ jobPack, layout: 'Risk / Notes / QA', pageNumber, pageCount, pageType: 'QA' })}
    </section>
  `;
}

function routeFeatures(features: JobPackMapFeature[]): JobPackMapFeature[] {
  return features.filter((feature) => feature.points.length > 1 && fibreBucket(feature) !== 'DROP');
}

function dropAndHomeFeatures(features: JobPackMapFeature[]): JobPackMapFeature[] {
  return features.filter((feature) => {
    const text = `${feature.type} ${feature.name} ${feature.cableType || ''}`.toLowerCase();
    return fibreBucket(feature) === 'DROP' || text.includes('home') || text.includes('uprn') || text.includes('premise');
  });
}


function buildRouteSheetFeatures(allFeatures: JobPackMapFeature[], route: JobPackMapFeature, bounds: ReturnType<typeof expandJobPackBounds>): JobPackMapFeature[] {
  const routeBucket = fibreBucket(route);
  const cableContextInsideRouteView = allFeatures.filter((candidate) => {
    if (candidate.id === route.id) return false;
    if (candidate.points.length <= 1) return false;
    if (fibreBucket(candidate) === 'DROP') return jobPackFeatureInsideBounds(candidate, bounds);
    if (fibreBucket(candidate) === routeBucket) return true;
    return jobPackFeatureInsideBounds(candidate, bounds);
  });

  const pointAssetsInsideRouteView = allFeatures.filter((candidate) => {
    if (candidate.id === route.id) return false;
    if (candidate.points.length !== 1) return false;
    return jobPackFeatureInsideBounds(candidate, bounds);
  });

  // Keep the selected route prominent, but include nearby cable context so
  // sheets do not show CMJs/SBs floating without the feeder/link legs that
  // explain why those assets are on the page.
  return [route, ...cableContextInsideRouteView, ...pointAssetsInsideRouteView];
}

function routeTitle(feature: JobPackMapFeature, index: number): string {
  const bucket = fibreBucket(feature);
  return `${bucket === 'OTHER' ? 'Route' : bucket} Route ${index + 1} · ${feature.name}`;
}

export function buildProductionJobPackHtml(jobPack: JobPackDocumentModel): string {
  const allFeatures = jobPack.assets.map(jobPackFeatureFromAsset).filter(Boolean) as JobPackMapFeature[];
  const overviewBounds = boundsForJobPackFeatures(allFeatures) || { minLat: 53.8, maxLat: 53.82, minLng: -1.8, maxLng: -1.76 };
  const routes = routeFeatures(allFeatures)
    .sort((a, b) => {
      const order = { '96F': 0, '48F': 1, '12F': 2, DROP: 3, OTHER: 4 } as Record<string, number>;
      return (order[fibreBucket(a)] ?? 9) - (order[fibreBucket(b)] ?? 9) || a.name.localeCompare(b.name);
    })
    .slice(0, 36);
  const fasRows = buildFasRows(jobPack);
  const fasPages = [fasRows.slice(0, 40), fasRows.slice(40, 80)].filter((rows) => rows.length);
  const dropHomeFeatures = dropAndHomeFeatures(allFeatures);
  const hasDropHomePage = dropHomeFeatures.length > 0;

  const staticPageCount = 1 + 1 + 1 + (hasDropHomePage ? 1 : 0) + 4 + fasPages.length + 2;
  const pageCount = staticPageCount + routes.length;
  let pageNumber = 1;
  const contents: JobPackContentsItem[] = [];
  const pages: string[] = [];

  contents.push({ pageNumber, title: 'Cover', description: 'Job pack control sheet and live map summary.' });
  pages.push(coverPage(jobPack, pageNumber++, pageCount));

  contents.push({ pageNumber, title: 'Contents', description: 'Page register for maps, route sheets and schedules.' });
  pages.push(renderJobPackContentsPage({ jobPack, pageNumber: pageNumber++, pageCount, items: contents }));

  contents.push({ pageNumber, title: 'Overview · All Routes', description: 'Project boundary, DPs, cables and homes as dots only.' });
  pages.push(renderJobPackOverviewPage({ jobPack, pageNumber: pageNumber++, pageCount, features: allFeatures, bounds: overviewBounds }));

  routes.forEach((feature, index) => {
    const seedBounds = expandJobPackBounds(boundsForJobPackFeatures([feature]) || overviewBounds, 0.65);
    const routeSheetFeatures = buildRouteSheetFeatures(allFeatures, feature, seedBounds);
    const bounds = expandJobPackBounds(boundsForJobPackFeatures(routeSheetFeatures) || seedBounds, 0.16);
    const title = routeTitle(feature, index);
    contents.push({ pageNumber, title, description: 'Auto-fit route sheet showing the selected route, related cable context and nearby assets.' });
    pages.push(renderJobPackRoutePage({
      jobPack,
      layout: title,
      pageNumber: pageNumber++,
      pageCount,
      features: routeSheetFeatures,
      bounds,
      focusedAssetId: feature.id,
      caption: renderRouteCaption(feature),
      routeMeta: fibreBucket(feature),
    }));
  });

  const schedules = [
    { title: 'DP Schedule', layout: 'DP Schedule', filter: /dp|distribution|cbt|afn|\bsb\d+/i },
    { title: 'Pole Schedule', layout: 'Pole Schedule', filter: /pole/i },
    { title: 'Chamber Schedule', layout: 'Chamber Schedule', filter: /chamber|fw\d+/i },
    { title: 'Cable Schedule', layout: 'Cable Schedule', filter: /cable|route|fibre|96f|48f|12f/i },
  ];



  if (hasDropHomePage) {
    const dropBounds = boundsForJobPackFeatures(dropHomeFeatures) || overviewBounds;
    contents.push({ pageNumber, title: 'Drop / Home Overview', description: 'Drop routes and home points. Homes are dots only with no UPRN labels.' });
    pages.push(renderJobPackRoutePage({
      jobPack,
      layout: 'Drop / Home Overview',
      pageNumber: pageNumber++,
      pageCount,
      features: dropHomeFeatures,
      bounds: expandJobPackBounds(dropBounds, 0.28),
      caption: `${dropHomeFeatures.length} drop/home features plotted from live map data. Home labels and UPRNs are intentionally hidden.`,
      routeMeta: 'Drops / homes',
    }));
  }

  schedules.forEach((schedule) => {
    contents.push({ pageNumber, title: schedule.title, description: 'Asset schedule generated from the live job pack model.' });
    pages.push(renderAssetSchedulePage({ jobPack, pageNumber: pageNumber++, pageCount, title: schedule.title, layout: schedule.layout, filter: schedule.filter }));
  });

  fasPages.forEach((rows, index) => {
    contents.push({ pageNumber, title: `FAS / Fibre Allocation ${index + 1}`, description: 'Fibre allocation schedule generated from cable and DP records.' });
    pages.push(renderFasPage(jobPack, pageNumber++, pageCount, rows));
  });

  contents.push({ pageNumber, title: 'Issue / Risk Register', description: 'Warnings, blockers and required actions before issue.' });
  pages.push(renderRiskPage(jobPack, pageNumber++, pageCount, jobPack.risks));

  contents.push({ pageNumber, title: 'Risk, Notes and QA', description: 'Construction notes and quality checks.' });
  pages.push(sectionNotesPage(jobPack, pageNumber++, pageCount));

  // Re-render contents after all page numbers have been collected.
  pages[1] = renderJobPackContentsPage({ jobPack, pageNumber: 2, pageCount, items: contents });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeJobPackHtml(jobPack.jobPackNumber)} · Alistra GIS Job Pack</title>
<style>${productionCss()}</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button><span>Alistra GIS map-first Job Pack · generated from live saved map data · no UPRN labels printed.</span></div>
  ${pages.join('')}
</body>
</html>`;
}

function productionCss(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; background: #dbe3ee; color: #111827; font-family: Arial, Helvetica, sans-serif; }
    .toolbar { position: sticky; top: 0; z-index: 10; padding: 10px 14px; background: #0f172a; color: white; display: flex; gap: 10px; align-items: center; }
    .toolbar button { border: 0; border-radius: 8px; padding: 9px 12px; font-weight: 900; cursor: pointer; background: #38bdf8; color: #082f49; }
    .toolbar span { color: #cbd5e1; font-size: 13px; }
    .pdf-page { width: ${PAGE_WIDTH}px; height: ${PAGE_HEIGHT}px; margin: 16px auto; background: white; display: grid; grid-template-columns: ${MAP_WIDTH}px ${SIDE_WIDTH}px; overflow: hidden; border: 2px solid #0f172a; page-break-after: always; }
    .map-area { position: relative; border-right: 2px solid #0f172a; background: #f8fafc; }
    .map-area svg { display: block; width: ${MAP_WIDTH}px; height: ${PAGE_HEIGHT}px; }
    .osm-basemap image { image-rendering: auto; }
    .text-area, .cover-area, .table-area { padding: 28px; border-right: 2px solid #0f172a; overflow: hidden; }
    .grid-line { stroke: #e2e8f0; stroke-width: 1; }
    .boundary-route { stroke: #111827; stroke-width: 4; stroke-dasharray: 18 10; }
    .cable-label, .asset-label { font-size: 19px; font-weight: 900; fill: #111827; paint-order: stroke; stroke: white; stroke-width: 5px; stroke-linejoin: round; filter: url(#labelGlow); }
    .cable-label { font-size: 16px; fill: #0f172a; }
    .focused-label { fill: #1d4ed8; font-size: 20px; }
    .coord-label { font-size: 13px; fill: #64748b; }
    .map-caption { position: absolute; left: 18px; right: 18px; bottom: 18px; padding: 10px 12px; border: 1px solid rgba(15,23,42,.22); background: rgba(255,255,255,.94); border-radius: 10px; font-size: 15px; font-weight: 800; color: #0f172a; }
    .north-arrow { position: absolute; top: 18px; left: 18px; width: 58px; height: 78px; display: grid; justify-items: center; gap: 2px; padding: 7px; border: 1px solid #0f172a; border-radius: 10px; background: rgba(255,255,255,.94); }
    .north-triangle { width: 0; height: 0; border-left: 15px solid transparent; border-right: 15px solid transparent; border-bottom: 42px solid #0f172a; }
    .north-arrow strong { font-size: 15px; }
    .title-block { display: grid; grid-template-rows: auto auto auto 1fr auto; background: #f8fafc; }
    .tb-box { padding: 11px 12px; border-bottom: 2px solid #0f172a; }
    .tb-box h3 { margin: 0 0 8px; font-size: 14px; letter-spacing: .08em; color: #0f172a; }
    .tb-row { display: grid; grid-template-columns: 92px 1fr; gap: 6px; padding: 4px 0; border-top: 1px solid #cbd5e1; font-size: 11px; }
    .tb-row:first-of-type { border-top: 0; }
    .tb-row strong { color: #334155; }
    .tb-row span { font-weight: 800; color: #0f172a; word-break: break-word; }
    .tb-row .blue { color: #1d4ed8; }
    .legend-row { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; margin: 6px 0; }
    .legend-circle, .legend-square, .legend-dot { display: inline-block; width: 16px; height: 16px; border: 2px solid #111827; }
    .legend-circle { border-radius: 999px; }
    .legend-dot { width: 8px; height: 8px; border-radius: 999px; background: #f97316; border-color: #ea580c; }
    .legend-circle.pole { background: #f8fafc; }
    .legend-circle.dp { background: #facc15; }
    .legend-circle.joint { background: #2563eb; }
    .legend-square.chamber { background: #e879f9; }
    .legend-line { display: inline-block; width: 34px; height: 0; border-top: 4px dashed #64748b; }
    .legend-line.f96 { border-color: #2563eb; }
    .legend-line.f48 { border-color: #16a34a; }
    .legend-line.f12 { border-color: #7c3aed; }
    .legend-line.drop { border-color: #f97316; border-top-style: solid; }
    .legend-line.boundary { border-color: #111827; }
    .scale-bar { display: grid; grid-template-columns: repeat(4, 1fr); width: 160px; height: 16px; border: 1px solid #111827; }
    .scale-bar span:nth-child(odd) { background: #111827; }
    .scale-label { font-size: 11px; margin-top: 4px; font-weight: 800; color: #334155; }
    .brand-box { display: grid; place-content: center; text-align: center; border-bottom: 2px solid #0f172a; }
    .brand-name { font-size: 54px; line-height: 1; color: #1d4ed8; font-weight: 900; letter-spacing: -3px; }
    .brand-sub { font-size: 68px; line-height: .85; color: #0f172a; font-weight: 900; }
    .brand-box small { margin-top: 6px; color: #475569; font-size: 10px; font-weight: 900; letter-spacing: .12em; }
    .page-box { display: grid; place-content: center; gap: 4px; font-size: 14px; text-align: center; }
    .cover-page { background: linear-gradient(135deg, #f8fafc, #e0f2fe); }
    .cover-brand { display: flex; align-items: baseline; gap: 10px; font-weight: 900; color: #1d4ed8; font-size: 62px; }
    .cover-brand strong { color: #0f172a; font-size: 82px; }
    .cover-kicker, .document-eyebrow { color: #0284c7; font-size: 13px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; margin-top: 18px; }
    .cover-area h1 { margin: 70px 0 6px; font-size: 56px; color: #0f172a; }
    .cover-area h2 { margin: 0 0 34px; font-size: 24px; color: #334155; }
    .cover-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; max-width: 920px; }
    .cover-grid div, .note-card { border: 1px solid #cbd5e1; border-radius: 16px; padding: 16px; background: rgba(255,255,255,.78); }
    .cover-grid span { display: block; color: #64748b; font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .cover-grid strong { display: block; margin-top: 6px; font-size: 25px; color: #0f172a; }
    .cover-note { margin-top: 46px; max-width: 780px; color: #334155; font-size: 18px; line-height: 1.45; font-weight: 700; }
    .document-title-block h1 { font-size: 42px; margin: 8px 0; }
    .document-title-block p { font-size: 17px; color: #475569; font-weight: 700; }
    .contents-table, .fas-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .contents-table { margin-top: 26px; font-size: 15px; }
    .contents-table th, .contents-table td, .fas-table th, .fas-table td { border: 1px solid #0f172a; padding: 6px 7px; vertical-align: top; }
    .contents-table th, .fas-table th { background: #dbeafe; text-align: left; color: #0f172a; font-weight: 900; }
    .fas-table td { height: 22px; }
    .table-area h2 { margin: 0 0 10px; font-size: 25px; color: #0f172a; }
    .note-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 22px; }
    .note-card h3 { margin: 0 0 8px; color: #0f172a; }
    .note-card ul { margin: 0; padding-left: 18px; color: #334155; font-weight: 700; line-height: 1.35; }
    @media print {
      @page { size: A3 landscape; margin: 0; }
      body { background: white; }
      .toolbar { display: none; }
      .pdf-page { margin: 0; width: 420mm; height: 297mm; border-width: 1px; page-break-after: always; }
    }
  `;
}
