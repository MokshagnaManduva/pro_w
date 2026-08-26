/**
 * Stored-file metadata — FROZEN CONTRACT (V0).
 *
 * V3 (file upload) owns this record. Kept in memory (no database this phase)
 * and rebuilt on boot by scanning the uploads directory.
 */
export type UploadCategory =
  | 'deliverables'
  | 'resumes'
  | 'certificates'
  | 'avatars'
  | 'attachments';

export interface IUploadMeta {
  id: string;
  category: UploadCategory;
  /** Name as the user's browser supplied it — display only, never a disk path. */
  originalName: string;
  /** Generated on-disk filename. Never derived from originalName. */
  storedName: string;
  /** Path relative to the uploads root. */
  relativePath: string;
  size: number;
  mimetype: string;
  ownerId: string | null;
  taskId?: string | null;
  milestoneId?: string | null;
  uploadedAt: string;
}
