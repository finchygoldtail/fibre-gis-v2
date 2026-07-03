import type { JobPackDraftAsset, JobPackRouteDraft, JobPackRouteFibreCount } from "./jobPackTypes";

const routeCounts: JobPackRouteFibreCount[] = ["96F", "48F", "36F", "24F", "12F"];

export function isJobPackRouteFibreCount(value?: string): value is JobPackRouteFibreCount {
  return Boolean(value && routeCounts.includes(value as JobPackRouteFibreCount));
}

export function buildJobPackRoutes(assets: JobPackDraftAsset[]): JobPackRouteDraft[] {
  return routeCounts.map((fibreCount) => {
    const routeAssets = assets.filter((asset) => asset.group === "route" && asset.fibreCount === fibreCount);
    return {
      id: `route-${fibreCount.toLowerCase()}`,
      title: `${fibreCount} Route Pages`,
      fibreCount,
      installMethod: routeAssets.find((asset) => asset.installMethod)?.installMethod,
      assets: routeAssets,
      notes: routeAssets.length
        ? `${routeAssets.length} live map route asset${routeAssets.length === 1 ? "" : "s"} found for review.`
        : "No live map route assets found for this fibre count.",
      reviewStatus: "unchecked",
    };
  });
}
