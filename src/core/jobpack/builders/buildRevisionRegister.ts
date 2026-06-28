import type { BuildPartnerJobPackInput, BuildPartnerJobPackSection } from '../jobPackModels';

export function buildRevisionRegister(input: BuildPartnerJobPackInput): BuildPartnerJobPackSection {
  return {
    key: 'revision_register',
    title: 'Revision Register',
    fileName: '02_Revision_Register.md',
    lines: [
      `Current revision: ${input.revisionNumber || 'LIVE'}`,
      `Issue reason: ${input.reason || 'Generated from live map.'}`,
      `Affected assets: ${(input.affectedAssets || []).length || 'All area assets'}`,
      'Previous revisions are superseded when a new IFC pack is issued.',
      'FAS, schedules and QA outputs are regenerated from the live map.',
    ],
  };
}
