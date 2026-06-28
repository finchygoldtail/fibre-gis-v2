export function renderNorthArrowHtml(): string {
  return `
    <div class="north-arrow" aria-label="North arrow">
      <div class="north-triangle"></div>
      <strong>N</strong>
    </div>
  `;
}

export function renderScaleBarHtml(label = 'Indicative scale'): string {
  return `
    <div class="scale-wrap" aria-label="Scale bar">
      <div class="scale-bar"><span></span><span></span><span></span><span></span></div>
      <div class="scale-label">${label}</div>
    </div>
  `;
}

export function renderPageNumberHtml(pageNumber: number, pageCount: number): string {
  return `<div class="tb-box page-box"><strong>PAGE</strong><span>${pageNumber} of ${pageCount}</span></div>`;
}
