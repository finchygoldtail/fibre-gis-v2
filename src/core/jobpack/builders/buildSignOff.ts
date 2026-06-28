import type { BuildPartnerJobPackSection } from '../jobPackModels';

export function buildSignOff(): BuildPartnerJobPackSection {
  return {
    key: 'sign_off',
    title: 'Issue / Sign Off',
    fileName: '17_Sign_Off.md',
    lines: [
      'Build Manager issue: __________________________ Date: __________',
      'Build Partner accepted: ________________________ Date: __________',
      'QA accepted: ___________________________________ Date: __________',
      'Walk-off complete: _____________________________ Date: __________',
      'As-Built generated from live map after completion only.',
    ],
  };
}
