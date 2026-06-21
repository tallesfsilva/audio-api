// src/infrastructure/storage/multer.ts
import multer from 'multer';
import path from 'path';
// import fs from 'fs';
import { Request } from 'express';
// import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config';
import { UnsupportedFileError } from '../../shared/errors';
const { S3Client } = require('@aws-sdk/client-s3')
import { v4 as uuidv4 } from 'uuid';
import { MulterS3File } from '@/shared/types/domain';
const multerS3 = require('multer-s3')
const ACCEPTED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'audio/m4a',
  'audio/x-m4a',
  'audio/webm',
  'video/mp4',
  'video/webm',
  'video/x-matroska',
  'video/x-msvideo',
  'video/quicktime',
  'application/octet-stream', // some browsers send this for audio files
]);

const ACCEPTED_EXTENSIONS = new Set([
  '.mp3', '.mp4', '.wav', '.m4a', '.ogg', '.flac', '.webm', '.mkv', '.avi', '.mov',
]);

const MAX_FILE_SIZE = config.STORAGE_LOCAL_MAX_SIZE_MB * 1024 * 1024;

// const diskStorage: StorageEngine = multer.diskStorage({
//   destination(
//     req: Request,
//     _file: Express.Multer.File,
//     cb: (error: Error | null, destination: string) => void,
//   ) {
//     const userId = req.user?.sub ?? 'anonymous';
//     const dir = path.resolve(config.STORAGE_LOCAL_BASE_PATH, 'uploads', userId);
//     fs.mkdirSync(dir, { recursive: true });
//     cb(null, dir);
//   },
//   filename(
//     _req: Request,
//     file: Express.Multer.File,
//     cb: (error: Error | null, filename: string) => void,
//   ) {
//     const ext = path.extname(file.originalname).toLowerCase();
//     cb(null, `${uuidv4()}${ext}`);
//   },
// });

function fileFilter(
  _req: Request,
  file:  MulterS3File,
  cb: multer.FileFilterCallback,
): void {
  const ext = path.extname(file.originalname).toLowerCase();
  const isMimeOk = ACCEPTED_MIME_TYPES.has(file.mimetype);
  const isExtOk = ACCEPTED_EXTENSIONS.has(ext);

  if (!isMimeOk && !isExtOk) {
    cb(new UnsupportedFileError(file.mimetype));
    return;
  }

  cb(null, true);
}

//const memoryStorage = multer.memoryStorage();
 const s3 = new S3Client({
        region: config.AWS_REGION,
          credentials: {
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey:config.AWS_SECRET_ACCESS_KEY,
          },
    });



export const uploadMiddleware = multer({
  storage: multerS3({
    s3: s3,
    bucket: config.AWS_S3_BUCKET,
    cacheControl: 'max-age=86400', // 24 hours
    contentDisposition: 'attachment',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (
      req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, key?: string) => void,
    ) => {
      const userId = req.user?.sub ?? 'anonymous';

      const ext = path.extname(file.originalname).toLowerCase();
      

      const generatedFileName = `${uuidv4()}${ext}`;

      const fileKey = `uploads/${userId}/${generatedFileName}`;

      cb(null, fileKey);
    },
  }),
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});
