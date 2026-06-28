export function renderJobPackLegendHtml(): string {
  return `
    <div class="legend-row"><span class="legend-circle pole"></span>Proposed / Existing Pole</div>
    <div class="legend-row"><span class="legend-circle dp"></span>Distribution Point / SB</div>
    <div class="legend-row"><span class="legend-circle joint"></span>Fibre Joint</div>
    <div class="legend-row"><span class="legend-square chamber"></span>Chamber</div>
    <div class="legend-row"><span class="legend-dot home"></span>Home / Premise dot</div>
    <div class="legend-row"><span class="legend-line f96"></span>96F route</div>
    <div class="legend-row"><span class="legend-line f48"></span>48F route</div>
    <div class="legend-row"><span class="legend-line f12"></span>12F route</div>
    <div class="legend-row"><span class="legend-line drop"></span>Drop / spur</div>
    <div class="legend-row"><span class="legend-line boundary"></span>Project boundary</div>
  `;
}
