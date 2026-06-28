import type { BuildPartnerJobPackAssetRecord, BuildPartnerJobPackSection } from '../jobPackModels';
import { isCable, isChamber, isDp, isJoint, isPole } from '../jobPackAssetUtils';

export function buildScopeOfWorks(records: BuildPartnerJobPackAssetRecord[]): BuildPartnerJobPackSection {
  return {
    key: 'scope',
    title: 'Scope of Works',
    fileName: '01_Scope_Of_Works.md',
    lines: [
      `Install / verify ${records.filter(isCable).length} cable routes.`,
      `Install / verify ${records.filter(isDp).length} DPs / CBTs / AFNs.`,
      `Verify ${records.filter(isPole).length} poles and ${records.filter(isChamber).length} chambers.`,
      `Verify ${records.filter(isJoint).length} joints and splice points.`,
      'Do not work outside the selected project area unless a revised pack is issued.',
      'Any route, fibre, asset or PIA change must be raised as an Engineering Change Request.',
    ],
  };
}
