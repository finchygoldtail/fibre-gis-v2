import type { JobPackAssetRecord, JobPackDocumentModel, JobPackRisk } from '../../engineering/jobPackTypes';
import { escapeJobPackHtml, renderJobPackTitleBlock } from './JobPackHeader';

function rowHtml(row: string[]): string {
  return `<tr>${row.map((cell) => `<td>${escapeJobPackHtml(cell)}</td>`).join('')}</tr>`;
}

export function renderTableRows(rows: string[][], columnCount: number, filler = 32): string {
  const body = rows.map(rowHtml).join('');
  const extra = Array.from({ length: Math.max(0, filler - rows.length) }, () => `<tr>${Array.from({ length: columnCount }, (_, index) => `<td>${index === 0 ? '&nbsp;' : ''}</td>`).join('')}</tr>`).join('');
  return body + extra;
}

function isType(asset: JobPackAssetRecord, search: RegExp): boolean {
  return search.test(`${asset.type} ${asset.name} ${asset.cableType || ''} ${asset.installMethod || ''}`);
}

function assetRows(assets: JobPackAssetRecord[], type: RegExp): string[][] {
  return assets.filter((asset) => isType(asset, type)).slice(0, 60).map((asset) => [
    asset.name,
    asset.type,
    asset.status || 'TBC',
    asset.installMethod || '',
    asset.fibreCount || '',
    asset.geometrySummary || '',
    asset.workInstruction || '',
  ]);
}

export function buildFasRows(jobPack: JobPackDocumentModel): string[][] {
  const cables = jobPack.assets.filter((asset) => isType(asset, /cable|route|fibre/i));
  const dps = jobPack.assets.filter((asset) => isType(asset, /dp|distribution|cbt|afn|\bsb\d+/i));
  const rows: string[][] = [];
  cables.slice(0, 80).forEach((cable, cableIndex) => {
    const fibreCount = Number(String(cable.fibreCount || '').replace(/\D/g, '')) || (cable.name.includes('96') ? 96 : cable.name.includes('48') ? 48 : 12);
    const targetDps = dps.slice(cableIndex % Math.max(1, dps.length), (cableIndex % Math.max(1, dps.length)) + 4);
    for (let fibre = 1; fibre <= Math.min(fibreCount, 12); fibre += 1) {
      const dp = targetDps[(fibre - 1) % Math.max(1, targetDps.length)];
      rows.push([jobPack.areaId, String(fibre), cable.name, String(fibre), dp?.name || 'To be allocated', dp ? `${dp.name}-SP${((fibre - 1) % 8) + 1}` : '']);
    }
  });
  return rows.length ? rows : jobPack.assets.slice(0, 30).map((asset, index) => [jobPack.areaId, String(index + 1), asset.name, '', asset.type, asset.status || '']);
}

export function renderFasPage(jobPack: JobPackDocumentModel, pageNumber: number, pageCount: number, rows: string[][]): string {
  return `
    <section class="pdf-page table-page">
      <main class="table-area">
        <h2>FAS / Fibre Allocation</h2>
        <table class="fas-table"><thead><tr><th>Link Cable</th><th>Link Fibre</th><th>Cable Name</th><th>Fibre</th><th>End Point</th><th>Notes</th></tr></thead><tbody>${renderTableRows(rows, 6, 34)}</tbody></table>
      </main>
      ${renderJobPackTitleBlock({ jobPack, layout: 'FAS / Fibre Allocation', pageNumber, pageCount, pageType: 'Schedule' })}
    </section>
  `;
}

export function renderAssetSchedulePage(args: {
  jobPack: JobPackDocumentModel;
  pageNumber: number;
  pageCount: number;
  title: string;
  layout: string;
  filter: RegExp;
}): string {
  const rows = assetRows(args.jobPack.assets, args.filter);
  return `
    <section class="pdf-page table-page">
      <main class="table-area">
        <h2>${escapeJobPackHtml(args.title)}</h2>
        <table class="fas-table"><thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Install</th><th>Fibre</th><th>Location</th><th>Instruction</th></tr></thead><tbody>${renderTableRows(rows, 7, 32)}</tbody></table>
      </main>
      ${renderJobPackTitleBlock({ jobPack: args.jobPack, layout: args.layout, pageNumber: args.pageNumber, pageCount: args.pageCount, pageType: 'Schedule' })}
    </section>
  `;
}

export function renderRiskPage(jobPack: JobPackDocumentModel, pageNumber: number, pageCount: number, risks: JobPackRisk[]): string {
  const rows = risks.length
    ? risks.map((risk) => [risk.level.toUpperCase(), risk.assetName || 'Area', risk.message, risk.recommendedAction, risk.title, risk.assetId || ''])
    : [['INFO', jobPack.areaName || jobPack.areaId, 'No blockers found.', 'Proceed with normal review.', 'Issue Check', '']];
  return `
    <section class="pdf-page table-page">
      <main class="table-area">
        <h2>Issue / Risk Register</h2>
        <table class="fas-table"><thead><tr><th>Level</th><th>Asset</th><th>Issue</th><th>Required Action</th><th>Category</th><th>Asset ID</th></tr></thead><tbody>${renderTableRows(rows, 6, 32)}</tbody></table>
      </main>
      ${renderJobPackTitleBlock({ jobPack, layout: 'Issue Register', pageNumber, pageCount, pageType: 'Risk / QA' })}
    </section>
  `;
}
