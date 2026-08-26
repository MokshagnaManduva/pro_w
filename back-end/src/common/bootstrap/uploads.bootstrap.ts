import type { INestApplication } from '@nestjs/common';

/**
 * V3 (v3-file-upload) — OWNED BY THE FILE-UPLOAD LAYER.
 *
 * Filesystem preparation for uploads: ensure the category directories exist
 * before multer needs them.
 *
 * NOTE: serving uploads/ as static assets belongs to V4 (security), together
 * with the path-traversal guard. See Team-Branch-Split-Plan.md section 2.1.
 *
 * main.ts is FROZEN — put your app-level setup here, not there.
 */
export function setupUploads(_app: INestApplication): void {
  // V3: fs.mkdirSync(uploads/<category>, { recursive: true }) for each category.
}
