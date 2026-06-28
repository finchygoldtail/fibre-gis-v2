import type { JobPackDocumentModel } from '../../engineering/jobPackTypes';
import { fibreBucket, renderJobPackRoutePage, type JobPackBounds, type JobPackMapFeature } from './JobPackRoutePage';

export function renderJobPackOverviewPage(args: {
  jobPack: JobPackDocumentModel;
  pageNumber: number;
  pageCount: number;
  features: JobPackMapFeature[];
  bounds: JobPackBounds;
}): string {
  const { jobPack } = args;
  const overviewFeatures = args.features.filter((feature) => feature.points.length <= 1 || fibreBucket(feature) !== 'DROP');
  return renderJobPackRoutePage({
    ...args,
    features: overviewFeatures,
    layout: 'Overview · All Routes',
    routeMeta: 'All trunk routes / assets / homes',
    caption: `Overview generated from live map · trunk routes shown · ${jobPack.summary.distributionPoints} DPs · ${jobPack.summary.homes} homes plotted as dots only · UPRNs hidden`,
    mode: 'overview',
  });
}
