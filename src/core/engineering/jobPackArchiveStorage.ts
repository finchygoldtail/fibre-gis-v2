import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../firebase';
import type { JobPackDocumentModel } from './jobPackTypes';
import {
  buildJobPackDownloadBundle,
  buildJobPackHtml,
  createZipBlob,
  type JobPackDownloadFormat,
} from './jobPackDownloadEngine';

export interface JobPackArchiveRecord {
  jobPackId: string;
  jobPackNumber: string;
  areaId: string;
  areaName?: string;
  revisionNumber?: string;
  format: JobPackDownloadFormat;
  storagePath: string;
  downloadUrl: string;
  fileName: string;
  archivedAt: string;
  archivedBy?: string;
}

function safeStoragePart(value: unknown, fallback = 'job-pack'): string {
  return String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|#%{}~&]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function safeFileStem(value: unknown, fallback = 'job-pack'): string {
  return safeStoragePart(value, fallback).toUpperCase();
}

function buildArchiveBlob(jobPack: JobPackDocumentModel, format: JobPackDownloadFormat): { blob: Blob; fileName: string; contentType: string } {
  const stem = safeFileStem(jobPack.jobPackNumber || `${jobPack.areaId}-JOB-PACK`);

  if (format === 'html') {
    return {
      blob: new Blob([buildJobPackHtml(jobPack)], { type: 'text/html' }),
      fileName: `${stem}.html`,
      contentType: 'text/html',
    };
  }

  if (format === 'json') {
    return {
      blob: new Blob([JSON.stringify(jobPack, null, 2)], { type: 'application/json' }),
      fileName: `${stem}.json`,
      contentType: 'application/json',
    };
  }

  const bundle = buildJobPackDownloadBundle(jobPack);
  return {
    blob: createZipBlob(bundle.files),
    fileName: bundle.fileName,
    contentType: 'application/zip',
  };
}

export function buildJobPackArchivePath(jobPack: JobPackDocumentModel, fileName: string): string {
  const area = safeStoragePart(jobPack.areaId || jobPack.areaName || 'unknown-area');
  const revision = safeStoragePart(jobPack.revisionNumber || 'LIVE');
  const pack = safeStoragePart(jobPack.jobPackNumber || jobPack.id || 'job-pack');

  return `businesses/fibre-gis-v2/jobPacks/${area}/${revision}/${pack}/${fileName}`;
}

export async function saveJobPackArchiveToFirebase(args: {
  jobPack: JobPackDocumentModel;
  format?: JobPackDownloadFormat;
  archivedBy?: string;
}): Promise<JobPackArchiveRecord> {
  const format = args.format || 'zip';
  const { blob, fileName, contentType } = buildArchiveBlob(args.jobPack, format);
  const storagePath = buildJobPackArchivePath(args.jobPack, fileName);
  const storageRef = ref(storage, storagePath);
  const archivedAt = new Date().toISOString();

  await uploadBytes(storageRef, blob, {
    contentType,
    customMetadata: {
      jobPackId: args.jobPack.id,
      jobPackNumber: args.jobPack.jobPackNumber,
      areaId: args.jobPack.areaId,
      areaName: args.jobPack.areaName || '',
      revisionNumber: args.jobPack.revisionNumber || '',
      archivedAt,
      archivedBy: args.archivedBy || '',
      format,
    },
  });

  const downloadUrl = await getDownloadURL(storageRef);

  return {
    jobPackId: args.jobPack.id,
    jobPackNumber: args.jobPack.jobPackNumber,
    areaId: args.jobPack.areaId,
    areaName: args.jobPack.areaName,
    revisionNumber: args.jobPack.revisionNumber,
    format,
    storagePath,
    downloadUrl,
    fileName,
    archivedAt,
    archivedBy: args.archivedBy,
  };
}
