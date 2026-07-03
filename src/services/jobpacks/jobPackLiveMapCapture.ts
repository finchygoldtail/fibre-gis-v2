import html2canvas from "html2canvas";

export async function captureCurrentLeafletMap(): Promise<string> {
  const mapElement = document.querySelector<HTMLElement>(".leaflet-container");
  if (!mapElement) {
    throw new Error("No live map is currently visible to capture.");
  }

  const canvas = await html2canvas(mapElement, {
    backgroundColor: "#ffffff",
    useCORS: true,
    allowTaint: true,
    logging: false,
    scale: 2,
    ignoreElements: (element) => {
      const node = element as HTMLElement;
      return Boolean(
        node.closest(".leaflet-control-container") ||
        node.closest(".leaflet-popup") ||
        node.closest(".leaflet-tooltip"),
      );
    },
  });

  return canvas.toDataURL("image/png", 0.96);
}
