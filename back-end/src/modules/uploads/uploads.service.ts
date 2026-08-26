import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import type { IUploadMeta, ITokenPayload, UploadCategory } from '../../common/contracts';
import { UPLOAD_ROOT, categoryDir } from '../../common/multer/multer.config';
import { UPLOAD_POLICIES } from '../../common/multer/upload-categories';
import { extname } from 'path';
import { UploadsRepository } from './uploads.repository';
import type { UploadContextDto } from './dto/upload-context.dto';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger('UploadsService');

  constructor(private readonly repo: UploadsRepository) {}

  /**
   * Enforce a category policy on an already-written file, deleting it if it
   * fails.
   *
   * NEEDED because FileFieldsInterceptor applies ONE multer config to ALL its
   * fields. The expert-document route accepts a résumé (PDF only) and a
   * certificate (PDF or image) through the same interceptor, so multer's
   * fileFilter can only enforce the looser of the two — a PNG would sail
   * through as a résumé. Verified before adding this.
   *
   * multer has already written the file by this point, so a failure has to
   * clean up after itself rather than just refusing.
   */
  async assertMatchesPolicy(file: Express.Multer.File, category: UploadCategory): Promise<void> {
    const policy = UPLOAD_POLICIES[category];
    const ext = extname(file.originalname).toLowerCase();

    const badExt = !policy.extensions.includes(ext);
    const badMime = !policy.mimeTypes.includes('*') && !policy.mimeTypes.includes(file.mimetype);
    const tooBig = file.size > policy.maxBytes;

    if (!badExt && !badMime && !tooBig) return;

    // Remove the rejected file; leaving it would accumulate junk that the API
    // has no record of and therefore cannot clean up.
    try {
      await fs.unlink(file.path);
    } catch (err) {
      this.logger.warn(`Could not remove rejected upload ${file.path}: ${String(err)}`);
    }

    const reason = tooBig
      ? `exceeds the ${Math.round(policy.maxBytes / 1024 / 1024)}MB limit for ${category}`
      : `is not an accepted type for ${category} (allowed: ${policy.extensions.join(', ')})`;

    throw new BadRequestException(`${file.originalname} ${reason}.`);
  }

  /** Turn multer's file objects into metadata records. */
  record(
    files: Express.Multer.File[],
    category: UploadCategory,
    context: UploadContextDto,
    user?: ITokenPayload,
  ): IUploadMeta[] {
    if (!files || files.length === 0) {
      throw new BadRequestException('No file was received. Attach at least one file.');
    }

    return files.map((file) =>
      this.repo.insert({
        id: this.repo.generateId(),
        category,
        originalName: file.originalname,
        storedName: file.filename,
        relativePath: `${category}/${file.filename}`,
        size: file.size,
        mimetype: file.mimetype,
        // Prefer the verified identity. The body field is a fallback for the
        // pre-auth phase and is NOT authoritative once tokens are in place.
        ownerId: user?.userId ?? context.ownerId ?? null,
        taskId: context.taskId ?? null,
        milestoneId: context.milestoneId ?? null,
        uploadedAt: new Date().toISOString(),
      }),
    );
  }

  findAll(query: Parameters<UploadsRepository['findAll']>[0]): IUploadMeta[] {
    return this.repo.findAll(query);
  }

  findById(id: string): IUploadMeta {
    const found = this.repo.findById(id);
    if (!found) throw new NotFoundException(`No upload found with id "${id}".`);
    return found;
  }

  /**
   * Resolve a record to an absolute path, refusing anything outside the upload
   * root.
   *
   * Records are generated internally, so this should be unreachable — which is
   * exactly why it is here. If a future change ever lets a caller influence
   * storedName, this is the check that stops it becoming arbitrary file read.
   */
  absolutePathFor(meta: IUploadMeta): string {
    const target = resolve(join(categoryDir(meta.category), meta.storedName));
    if (target !== UPLOAD_ROOT && !target.startsWith(UPLOAD_ROOT + '/')) {
      this.logger.error(`Refused path outside upload root: ${target}`);
      throw new ForbiddenException('Invalid file path.');
    }
    return target;
  }

  async remove(id: string, user?: ITokenPayload): Promise<{ id: string; deleted: boolean }> {
    const meta = this.findById(id);

    // Owner or superuser only. Without this, any authenticated caller could
    // delete anyone's deliverable.
    if (user && user.role !== 'superuser' && meta.ownerId && meta.ownerId !== user.userId) {
      throw new ForbiddenException('You can only delete files you uploaded.');
    }

    const path = this.absolutePathFor(meta);
    try {
      await fs.unlink(path);
    } catch (err) {
      // Already gone from disk: drop the record anyway rather than leaving an
      // entry that can never be cleaned up.
      this.logger.warn(`File missing on disk while deleting ${id}: ${String(err)}`);
    }

    this.repo.remove(id);
    return { id, deleted: true };
  }

  rescan(): Promise<number> {
    return this.repo.rescanDisk();
  }
}
