import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { IUploadMeta, UploadCategory } from '../../common/contracts';
import { UPLOAD_CATEGORIES, isUploadCategory } from '../../common/multer/upload-categories';
import { UPLOAD_ROOT, categoryDir } from '../../common/multer/multer.config';

/**
 * V3 (v3-file-upload) — in-memory metadata, same pattern as every other
 * repository in this project (no database in this phase).
 *
 * THE PROBLEM THAT CREATES, and the fix:
 * files live on disk and survive a restart, but the metadata array does not.
 * Without intervention, a restart would strand every previously-uploaded file:
 * still consuming space, invisible to the API, undeletable through it.
 *
 * So on boot we scan uploads/ and rebuild a record for anything we do not know
 * about. Recovered records lose the fields that only existed in memory (owner,
 * original filename, task linkage) — they are marked `recovered: true` and
 * carry the stored name, rather than pretending to be complete.
 */
@Injectable()
export class UploadsRepository implements OnModuleInit {
  private readonly logger = new Logger('UploadsRepository');
  private uploads: IUploadMeta[] = [];
  private counter = 100;

  async onModuleInit(): Promise<void> {
    await this.rescanDisk();
  }

  generateId(): string {
    return 'up_' + Date.now() + '_' + this.counter++;
  }

  insert(meta: IUploadMeta): IUploadMeta {
    this.uploads.push(meta);
    return meta;
  }

  findAll(query?: {
    category?: UploadCategory;
    ownerId?: string;
    taskId?: string;
    milestoneId?: string;
  }): IUploadMeta[] {
    let result = this.uploads;
    if (query?.category) result = result.filter((u) => u.category === query.category);
    if (query?.ownerId) result = result.filter((u) => u.ownerId === query.ownerId);
    if (query?.taskId) result = result.filter((u) => u.taskId === query.taskId);
    if (query?.milestoneId) result = result.filter((u) => u.milestoneId === query.milestoneId);
    // Newest first — the useful default for a file list.
    return [...result].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  findById(id: string): IUploadMeta | null {
    return this.uploads.find((u) => u.id === id) ?? null;
  }

  remove(id: string): IUploadMeta | null {
    const idx = this.uploads.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    return this.uploads.splice(idx, 1)[0];
  }

  /**
   * Rebuild records for files present on disk but absent from memory.
   * Safe to call repeatedly: existing records are matched by stored name.
   */
  async rescanDisk(): Promise<number> {
    let recovered = 0;
    const known = new Set(this.uploads.map((u) => u.storedName));

    for (const category of UPLOAD_CATEGORIES) {
      const dir = categoryDir(category);

      let names: string[];
      try {
        names = await fs.readdir(dir);
      } catch {
        continue; // category directory not created yet
      }

      for (const name of names) {
        if (name.startsWith('.') || known.has(name)) continue;

        try {
          const stat = await fs.stat(join(dir, name));
          if (!stat.isFile()) continue;

          this.uploads.push({
            id: this.generateId(),
            category,
            // We genuinely do not know the original name after a restart.
            // Saying so is better than inventing one.
            originalName: name,
            storedName: name,
            relativePath: `${category}/${name}`,
            size: stat.size,
            mimetype: 'application/octet-stream',
            ownerId: null,
            taskId: null,
            milestoneId: null,
            uploadedAt: stat.mtime.toISOString(),
            recovered: true,
          } as IUploadMeta & { recovered: boolean });
          recovered++;
        } catch {
          // File vanished between readdir and stat — skip it.
        }
      }
    }

    if (recovered > 0) {
      this.logger.log(`Recovered ${recovered} orphaned file(s) from ${UPLOAD_ROOT}`);
    }
    return recovered;
  }

  count(): number {
    return this.uploads.length;
  }
}
