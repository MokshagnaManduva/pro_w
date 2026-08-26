import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { randomBytes } from 'crypto';
import { extname, join, resolve } from 'path';
import { mkdirSync } from 'fs';
import type { UploadCategory } from '../contracts';
import { UPLOAD_POLICIES } from './upload-categories';

/**
 * V3 (v3-file-upload) — multer, the file-upload middleware.
 *
 * multer parses multipart/form-data, which express.json() cannot. In NestJS it
 * is applied through FileInterceptor / FilesInterceptor / FileFieldsInterceptor.
 */

export const UPLOAD_ROOT = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');

export function categoryDir(category: UploadCategory): string {
  return join(UPLOAD_ROOT, category);
}

/**
 * Generate the on-disk name. NEVER derived from file.originalname.
 *
 * Three separate reasons, all of which have bitten real systems:
 *  1. Path traversal — a name like "../../etc/passwd" would escape the
 *     directory entirely.
 *  2. Collisions — two users uploading "resume.pdf" would overwrite each other.
 *  3. Deliberate overwrite — an attacker who can choose the name can target an
 *     existing file.
 * The original name is kept in metadata for display only.
 */
function generateStoredName(originalName: string): string {
  const ext = extname(originalName).toLowerCase().slice(0, 12);
  return `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
}

/**
 * Build multer options for one category.
 *
 * fileFilter runs DURING the stream, so a rejected file never gets fully
 * written. Validating in the controller instead would mean the whole file has
 * already hit the disk before we decide we do not want it.
 */
export function multerOptionsFor(category: UploadCategory): MulterOptions {
  const policy = UPLOAD_POLICIES[category];

  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const dir = categoryDir(category);
        try {
          // Cheap and idempotent; guarantees the directory exists even if the
          // bootstrap hook did not run (tests, or a directory deleted at runtime).
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        } catch (err) {
          cb(err as Error, dir);
        }
      },
      filename: (_req, file, cb) => cb(null, generateStoredName(file.originalname)),
    }),

    limits: {
      fileSize: policy.maxBytes,
      files: policy.maxFiles,
      // Bound the non-file parts too, so a multipart body cannot be used to
      // smuggle an enormous text field past the JSON body limit.
      fields: 20,
      fieldSize: 1024 * 100,
    },

    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();

      if (!policy.extensions.includes(ext)) {
        return cb(
          new BadRequestException(
            `"${file.originalname}" is not an accepted file type for ${category}. ` +
              `Allowed: ${policy.extensions.join(', ')}`,
          ),
          false,
        );
      }

      // Extension AND mimetype, where the mimetype is meaningful. Neither is
      // sufficient alone: an extension is trivially renamed, and the mimetype
      // is client-supplied and equally spoofable. Together they stop honest
      // mistakes; neither stops a determined attacker, which is why generated
      // filenames and nosniff headers matter more.
      if (!policy.mimeTypes.includes('*') && !policy.mimeTypes.includes(file.mimetype)) {
        return cb(
          new BadRequestException(
            `"${file.originalname}" reports type ${file.mimetype}, which is not accepted for ${category}.`,
          ),
          false,
        );
      }

      cb(null, true);
    },
  };
}
