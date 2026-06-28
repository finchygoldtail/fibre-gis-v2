import type {
  BuildJobPackInput,
  JobPackDocumentModel,
} from './jobPackTypes';
import { generateBuildPartnerJobPack } from '../jobpack/jobPackGenerator';

/**
 * Phase 15C
 * The Engineering Core Job Pack now delegates to the Build Partner Job Pack
 * generator. This keeps the existing Delivery Workspace API stable while
 * producing a proper multi-section pack with schedules, FAS draft, QA checks,
 * issue register, material schedule and sign-off outputs.
 */
export function buildJobPackFromLiveAssets(input: BuildJobPackInput): JobPackDocumentModel {
  return generateBuildPartnerJobPack({
    areaId: input.areaId,
    areaName: input.areaName,
    revisionNumber: input.revisionNumber,
    reason: input.reason,
    generatedBy: input.generatedBy,
    affectedAssets: input.affectedAssets,
    assets: input.assets,
  });
}
