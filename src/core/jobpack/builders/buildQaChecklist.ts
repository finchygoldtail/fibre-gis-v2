import type { BuildPartnerJobPackSection } from '../jobPackModels';

export function buildQaChecklist(): BuildPartnerJobPackSection {
  return {
    key: 'qa_checklist',
    title: 'QA Checklist',
    fileName: '12_QA_Checklist.md',
    lines: [
      'Photos uploaded for poles, chambers, DPs, joints and route changes.',
      'Cable labels match the live map and FAS.',
      'DP status, serving homes and port/splitter allocation checked.',
      'Chamber lids, duct entries and cable routes checked.',
      'Pole suitability, spans and PIA evidence checked.',
      'Walk-off confirms no unapproved field changes.',
      'Any change from this pack must be raised as an ECR before As-Built generation.',
    ],
  };
}
