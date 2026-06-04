import L from "leaflet";

export function makeMeasureLabelIcon(text: string) {
  return L.divIcon({
    className: "alistra-measure-label",
    html: `<div style="background:#0f172a;color:#ffffff;border:1px solid #60a5fa;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:700;box-shadow:0 4px 12px rgba(15,23,42,0.35);white-space:nowrap;">${text}</div>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}
