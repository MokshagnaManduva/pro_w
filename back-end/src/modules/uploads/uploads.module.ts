import { Module } from '@nestjs/common';

/**
 * V3 (v3-file-upload) — OWNED BY THE FILE-UPLOAD LAYER.
 *
 * Fill in with:
 *
 *   imports:     [MulterModule.registerAsync({ useFactory: multerConfig })]
 *   controllers: [UploadsController]
 *   providers:   [UploadsService, UploadsRepository]
 *   exports:     [UploadsService]
 *
 * Reminders for this layer:
 *  - diskStorage, never memoryStorage (50 MB files must not sit in RAM).
 *  - Generate the stored filename; never use file.originalname as a disk path.
 *  - Validate extension AND mimetype in fileFilter, so rejection happens during
 *    the stream rather than after the file is already written.
 *  - Rescan uploads/ in OnModuleInit — metadata is in memory (no database this
 *    phase), so a restart would otherwise strand files with no record.
 */
@Module({})
export class UploadsModule {}
