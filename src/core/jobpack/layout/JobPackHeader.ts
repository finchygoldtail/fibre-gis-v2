import type { JobPackDocumentModel } from '../../engineering/jobPackTypes';
import { renderScaleBarHtml, renderPageNumberHtml } from './JobPackFooter';
import { renderJobPackLegendHtml } from './JobPackLegend';

export function escapeJobPackHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function jobPackProjectCode(jobPack: JobPackDocumentModel): string {
  const numberMatch = jobPack.jobPackNumber.match(/([A-Z]{2,4}-[A-Z]{2,8}-AG\d+)/i);
  if (numberMatch) return numberMatch[1].toUpperCase();
  const assetMatch = jobPack.assets.map((asset) => asset.name).join(' ').match(/([A-Z]{2,4}-[A-Z]{2,8}-AG\d+)/i);
  if (assetMatch) return assetMatch[1].toUpperCase();
  return jobPack.areaName || jobPack.areaId;
}

export function jobPackAreaCode(jobPack: JobPackDocumentModel): string {
  const code = jobPackProjectCode(jobPack);
  const parts = code.split('-');
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : (jobPack.areaName || jobPack.areaId);
}

export function renderJobPackTitleBlock(args: {
  jobPack: JobPackDocumentModel;
  layout: string;
  pageNumber: number;
  pageCount: number;
  pageType?: string;
  routeMeta?: string;
}): string {
  const { jobPack, layout, pageNumber, pageCount, pageType, routeMeta } = args;
  return `
    <aside class="title-block">
      <div class="tb-box">
        <h3>PROJECT INFORMATION</h3>
        <div class="tb-row"><strong>PROJECT CODE:</strong><span>${escapeJobPackHtml(jobPackProjectCode(jobPack))}</span></div>
        <div class="tb-row"><strong>AREA:</strong><span>${escapeJobPackHtml(jobPackAreaCode(jobPack))}</span></div>
        <div class="tb-row"><strong>PACK:</strong><span>${escapeJobPackHtml(jobPack.jobPackNumber)}</span></div>
        <div class="tb-row"><strong>REVISION:</strong><span>${escapeJobPackHtml(jobPack.revisionNumber || 'LIVE')}</span></div>
        <div class="tb-row"><strong>LAYOUT:</strong><span class="blue">${escapeJobPackHtml(layout)}</span></div>
        ${pageType ? `<div class="tb-row"><strong>SHEET TYPE:</strong><span>${escapeJobPackHtml(pageType)}</span></div>` : ''}
        ${routeMeta ? `<div class="tb-row"><strong>ROUTE:</strong><span>${escapeJobPackHtml(routeMeta)}</span></div>` : ''}
        <div class="tb-row"><strong>PLANNER:</strong><span>${escapeJobPackHtml(jobPack.generatedBy || 'Alistra GIS')}</span></div>
        <div class="tb-row"><strong>DATE:</strong><span>${escapeJobPackHtml(jobPack.generatedAt.slice(0, 10))}</span></div>
      </div>
      <div class="tb-box legend"><h3>MAP LEGEND</h3>${renderJobPackLegendHtml()}</div>
      <div class="tb-box scale-box"><h3>SCALE</h3>${renderScaleBarHtml()}</div>
      <div class="brand-box"><div class="brand-name">Alistra</div><div class="brand-sub">GIS</div><small>ENGINEERING JOB PACK</small></div>
      ${renderPageNumberHtml(pageNumber, pageCount)}
    </aside>
  `;
}
