import { EngineeringDocumentType } from '../engineering/engineeringTypes';
import type { JobPackAssetRecord, JobPackRisk, JobPackSection } from '../engineering/jobPackTypes';
import { toJobPackAssetRecord, isArea, isCable, isChamber, isDp, isHome, isJoint, isPole } from './jobPackAssetUtils';
import type {
  BuildPartnerJobPackInput,
  BuildPartnerJobPackIssue,
  BuildPartnerJobPackResult,
  BuildPartnerJobPackSection,
  BuildPartnerJobPackSummary,
  JobPackExportFile,
} from './jobPackModels';
import { buildBuildPartnerExportFiles } from './jobPackExporter';
import { validateJobPackAssets } from './jobPackValidation';
import {
  buildAssetSchedule,
  buildCableSchedule,
  buildChamberSchedule,
  buildConstructionNotes,
  buildCoverSheet,
  buildDpSchedule,
  buildFasDocument,
  buildHealthSafety,
  buildJointSchedule,
  buildMaterialSchedule,
  buildPhotoManifest,
  buildPoleSchedule,
  buildQaChecklist,
  buildRevisionRegister,
  buildRiskRegister,
  buildScopeOfWorks,
  buildSignOff,
  buildTrafficManagement,
} from './builders';

function safeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function packNumber(areaId: string, revision?: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${areaId}-JOB-PACK-${revision || 'LIVE'}-${stamp}`.replace(/\s+/g, '-').toUpperCase();
}

function summary(records: ReturnType<typeof toJobPackAssetRecord>[], issues: BuildPartnerJobPackIssue[]): BuildPartnerJobPackSummary {
  return {
    totalAssets: records.length,
    poles: records.filter(isPole).length,
    chambers: records.filter(isChamber).length,
    joints: records.filter(isJoint).length,
    dps: records.filter(isDp).length,
    cables: records.filter(isCable).length,
    homes: records.filter(isHome).length,
    areas: records.filter(isArea).length,
    overheadRoutes: records.filter((record) => isCable(record) && String(record.installMethod || '').toLowerCase().includes('oh')).length,
    undergroundRoutes: records.filter((record) => isCable(record) && String(record.installMethod || '').toLowerCase().includes('under')).length,
    routeLengthMeters: Math.round(records.filter(isCable).reduce((total, record) => total + (record.routeLengthMeters || 0), 0)),
    warnings: issues.filter((issue) => issue.level === 'warning').length,
    blockers: issues.filter((issue) => issue.level === 'blocker').length,
    photos: records.reduce((total, record) => total + record.photoCount, 0),
  };
}

function toEngineeringAssetRecords(records: ReturnType<typeof toJobPackAssetRecord>[]): JobPackAssetRecord[] {
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    type: record.type,
    status: record.status,
    installMethod: record.installMethod,
    fibreCount: record.fibreCount,
    cableType: record.cableType,
    geometrySummary: record.location,
    workInstruction: instructionFor(record),
    validationNotes: [],
    sourceAsset: record.raw,
  }));
}

function instructionFor(record: ReturnType<typeof toJobPackAssetRecord>): string {
  if (isCable(record)) return `Install / verify ${record.cableType || 'cable'} ${record.fibreCount || ''} by ${record.installMethod || 'TBC'} and confirm FAS labels.`;
  if (isDp(record)) return 'Install / verify DP, CBT or AFN. Confirm serving homes, splitter/port allocation and photo evidence.';
  if (isPole(record)) return 'Verify pole suitability, spans, route clearance, labels, PIA evidence and photos.';
  if (isChamber(record)) return 'Verify chamber lid, duct entries, cable route and photo evidence.';
  if (isJoint(record)) return 'Verify joint location, tray/splice record, labels and cable entries.';
  if (isHome(record)) return 'Confirm home status, drop route and linked DP allocation.';
  return 'Verify against the live map and record evidence before completion.';
}

function toEngineeringRisks(issues: BuildPartnerJobPackIssue[]): JobPackRisk[] {
  return issues.map((issue) => ({
    id: issue.id,
    level: issue.level,
    title: issue.category,
    message: issue.message,
    assetId: issue.assetId,
    assetName: issue.assetName,
    recommendedAction: issue.requiredAction,
  }));
}

function toEngineeringSections(sections: BuildPartnerJobPackSection[]): JobPackSection[] {
  return sections.map((section) => ({
    id: safeId('jobpack-section'),
    type: section.key === 'fas' ? 'fas_summary' : section.key === 'qa_checklist' ? 'quality_checks' : section.key === 'asset_schedule' ? 'asset_register' : section.key === 'scope' ? 'work_instructions' : 'overview',
    title: section.title,
    lines: section.lines,
  }));
}

function addScheduledBuilder<T extends { section: BuildPartnerJobPackSection; file: JobPackExportFile }>(
  result: T,
  sections: BuildPartnerJobPackSection[],
  files: JobPackExportFile[],
): void {
  sections.push(result.section);
  files.push(result.file);
}

export function generateBuildPartnerJobPack(input: BuildPartnerJobPackInput): BuildPartnerJobPackResult {
  const records = input.assets
    .map(toJobPackAssetRecord)
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const issues = validateJobPackAssets(records);
  const packSummary = summary(records, issues);
  const sections: BuildPartnerJobPackSection[] = [];
  const files: JobPackExportFile[] = [];

  sections.push(buildCoverSheet(input, packSummary));
  sections.push(buildScopeOfWorks(records));
  sections.push(buildRevisionRegister(input));
  sections.push(buildConstructionNotes(records));
  sections.push(buildHealthSafety());
  addScheduledBuilder(buildAssetSchedule(records), sections, files);
  addScheduledBuilder(buildPoleSchedule(records), sections, files);
  addScheduledBuilder(buildChamberSchedule(records), sections, files);
  addScheduledBuilder(buildJointSchedule(records), sections, files);
  addScheduledBuilder(buildDpSchedule(records), sections, files);
  addScheduledBuilder(buildCableSchedule(records), sections, files);
  addScheduledBuilder(buildFasDocument(records), sections, files);
  sections.push(buildQaChecklist());
  addScheduledBuilder(buildRiskRegister(issues), sections, files);
  addScheduledBuilder(buildMaterialSchedule(records), sections, files);
  sections.push(buildTrafficManagement(records));
  addScheduledBuilder(buildPhotoManifest(records), sections, files);
  sections.push(buildSignOff());

  const resultBase = {
    id: safeId('jobpack'),
    areaId: input.areaId,
    areaName: input.areaName,
    jobPackNumber: packNumber(input.areaId, input.revisionNumber),
    revisionNumber: input.revisionNumber,
    status: input.status || (packSummary.blockers > 0 ? 'draft' : 'ready_for_review'),
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy,
    reason: input.reason || 'Generated from live map state.',
    documentTypes: [EngineeringDocumentType.BuildPack, EngineeringDocumentType.FAS, EngineeringDocumentType.AsBuilt, EngineeringDocumentType.WalkOffPack],
    affectedAssets: input.affectedAssets || [],
    assets: toEngineeringAssetRecords(records),
    risks: toEngineeringRisks(issues),
    sections: toEngineeringSections(sections),
    summary: {
      totalAssets: packSummary.totalAssets,
      poles: packSummary.poles,
      chambers: packSummary.chambers,
      distributionPoints: packSummary.dps,
      joints: packSummary.joints,
      cables: packSummary.cables,
      homes: packSummary.homes,
      areas: packSummary.areas,
      overheadCables: packSummary.overheadRoutes,
      undergroundCables: packSummary.undergroundRoutes,
      warnings: packSummary.warnings,
      blockers: packSummary.blockers,
    },
    buildPartnerSummary: packSummary,
    buildPartnerSections: sections,
    issueRegister: issues,
    exportFiles: [],
  } satisfies BuildPartnerJobPackResult;

  const result: BuildPartnerJobPackResult = {
    ...resultBase,
    exportFiles: [],
  };
  result.exportFiles = buildBuildPartnerExportFiles(result, files);
  return result;
}
