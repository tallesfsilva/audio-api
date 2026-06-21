// src/infrastructure/storage/local.driver.ts
import fs from 'fs/promises';
import path from 'path';
import { config } from '../../config';
import { logger } from '../../shared/utils/logger';

const BASE = path.resolve(config.STORAGE_LOCAL_BASE_PATH);

export async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(path.join(BASE, 'uploads'), { recursive: true });
  await fs.mkdir(path.join(BASE, 'results'), { recursive: true });
  logger.info(`Local storage initialized at ${BASE}`);
}

export function buildFileKey(userId: string, jobId: string, originalName: string): string {
  const ext = path.extname(originalName);
  return `uploads/${userId}/${jobId}${ext}`;
}

export function buildResultKey(userId: string, jobId: string, format: string): string {
  return `results/${userId}/${jobId}.${format}`;
}

export function absolutePath(key: string): string {
  return path.join(BASE, key);
}

export async function deleteFile(key: string): Promise<void> {
  try {
    await fs.unlink(absolutePath(key));
  } catch {
    logger.warn(`Could not delete file: ${key}`);
  }
}

export async function readFile(key: string): Promise<Buffer> {
  return fs.readFile(absolutePath(key));
}
