import { Logger, type INestApplication } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { UPLOAD_ROOT, categoryDir } from '../multer/multer.config';
import { UPLOAD_CATEGORIES } from '../multer/upload-categories';

/**
 * V3 (v3-file-upload) — ensure the upload directories exist before multer
 * needs them.
 *
 * multer's diskStorage does NOT create a missing destination; it errors. The
 * storage callback also mkdirs defensively, but doing it once at boot means a
 * missing directory surfaces at startup rather than on a user's first upload.
 *
 * NOTE: serving these files back over HTTP belongs to V4 (security), together
 * with the path-traversal guard — see Team-Branch-Split-Plan.md section 2.1.
 */
export function setupUploads(_app: INestApplication): void {
  const logger = new Logger('Uploads');

  for (const category of UPLOAD_CATEGORIES) {
    mkdirSync(categoryDir(category), { recursive: true });
  }

  logger.log(`Upload directories ready under ${UPLOAD_ROOT}`);
}
