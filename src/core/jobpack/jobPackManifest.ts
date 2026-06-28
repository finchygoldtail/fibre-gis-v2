import type { BuildPartnerJobPackResult, JobPackExportFile } from './jobPackModels';

export function buildJobPackManifest(jobPack: BuildPartnerJobPackResult): JobPackExportFile {
  return {
    path: '00_Manifest/manifest.json',
    fileType: 'json',
    mimeType: 'application/json',
    content: JSON.stringify({
      jobPackNumber: jobPack.jobPackNumber,
      areaId: jobPack.areaId,
      areaName: jobPack.areaName,
      revisionNumber: jobPack.revisionNumber,
      status: jobPack.status,
      generatedAt: jobPack.generatedAt,
      generatedBy: jobPack.generatedBy,
      summary: jobPack.buildPartnerSummary,
      sections: jobPack.buildPartnerSections.map((section) => ({
        key: section.key,
        title: section.title,
        fileName: section.fileName,
      })),
    }, null, 2),
  };
}
