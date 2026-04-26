export const TRAY_COLOR = "#f3f4f6";
export const TRAY_OUTLINE = "#d1d5db";
export const SEARCH_HIGHLIGHT = "#ffeb3b";

export function getColourForFibre(pos: number): string {
  const palette = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#674a067c",
    "#6b6b6bff", "#ffffffff", "#e71616ff", "#000000ff",
    "#bcbd22", "#ac0ee5ff", "#f425a5ff", "#1dc2f0ff"
  ];
  return palette[pos % palette.length];
}
