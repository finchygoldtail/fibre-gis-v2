import type { BuildPartnerJobPackSection } from '../jobPackModels';

export function buildHealthSafety(): BuildPartnerJobPackSection {
  return {
    key: 'health_safety',
    title: 'Health & Safety Requirements',
    fileName: '04_Health_And_Safety.md',
    lines: [
      'Build Partner remains responsible for RAMS, permits and site-specific risk assessments.',
      'Check PIA / Openreach access requirements before entering chambers or working on poles.',
      'Do not climb or work overhead where pole suitability or clearance is uncertain.',
      'Escalate blocked ducts, unsafe chambers, traffic management issues or private land access before continuing.',
    ],
  };
}
