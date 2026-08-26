import type { UploadCategory } from '../contracts';

/**
 * V3 (v3-file-upload) — per-category upload policy.
 *
 * One place that answers "what may be uploaded, how big, and where does it
 * go". Keeping it as data rather than scattered `if` statements means the
 * policy can be read and reviewed without tracing the controller.
 *
 * The extension lists mirror the `accept` attributes already present in the
 * front-end (submit-deliverable.html, expert-signup.html) so the browser and
 * the server agree on what is allowed. The browser hint is a convenience; this
 * is the enforcement.
 */
export interface CategoryPolicy {
  maxBytes: number;
  maxFiles: number;
  extensions: string[];
  /** Mimetype prefixes/exact values accepted. '*' disables the mime check. */
  mimeTypes: string[];
  description: string;
}

const MB = 1024 * 1024;

const DELIVERABLE_EXTENSIONS = [
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.pdf',
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.cs',
  '.rb', '.go', '.rs', '.php',
  '.html', '.css', '.scss', '.json', '.xml', '.yml', '.yaml', '.md', '.sql',
  '.sh', '.bat', '.txt',
];

export const UPLOAD_POLICIES: Record<UploadCategory, CategoryPolicy> = {
  deliverables: {
    maxBytes: Number(process.env.MAX_DELIVERABLE_BYTES ?? 50 * MB),
    maxFiles: Number(process.env.MAX_FILES_PER_REQUEST ?? 10),
    extensions: DELIVERABLE_EXTENSIONS,
    // Source files arrive with wildly inconsistent mimetypes across browsers
    // (text/plain, application/octet-stream, empty). The extension allow-list
    // is the meaningful check here.
    mimeTypes: ['*'],
    description: 'Milestone deliverables: archives, documents, images, source files',
  },
  resumes: {
    maxBytes: Number(process.env.MAX_DOCUMENT_BYTES ?? 5 * MB),
    maxFiles: 1,
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
    description: 'Expert application résumé (PDF only)',
  },
  certificates: {
    maxBytes: Number(process.env.MAX_DOCUMENT_BYTES ?? 5 * MB),
    maxFiles: 1,
    extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    description: 'Expert credential or certificate',
  },
  avatars: {
    maxBytes: 2 * MB,
    maxFiles: 1,
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    description: 'Profile picture',
  },
  attachments: {
    maxBytes: 10 * MB,
    maxFiles: 5,
    extensions: ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.txt', '.md', '.zip'],
    mimeTypes: ['*'],
    description: 'Workroom message attachment',
  },
};

export const UPLOAD_CATEGORIES = Object.keys(UPLOAD_POLICIES) as UploadCategory[];

export function isUploadCategory(value: string): value is UploadCategory {
  return (UPLOAD_CATEGORIES as string[]).includes(value);
}
