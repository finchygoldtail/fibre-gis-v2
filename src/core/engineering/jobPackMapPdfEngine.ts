import type { JobPackDocumentModel } from './jobPackTypes';
import { buildProductionJobPackHtml } from '../jobpack/layout/JobPackLayout';

export function buildJobPackMapPdfHtml(jobPack: JobPackDocumentModel): string {
  return buildProductionJobPackHtml(jobPack);
}
