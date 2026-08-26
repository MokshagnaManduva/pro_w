import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { UploadsRepository } from './uploads.repository';

/**
 * V3 (v3-file-upload) — file upload middleware layer.
 *
 * No MulterModule.register() here on purpose: multer options are built
 * per-route by multerOptionsFor(category), because a 50MB deliverable and a
 * 2MB avatar need different limits and different accepted types. A single
 * module-wide config would force the loosest policy on every endpoint.
 */
@Module({
  controllers: [UploadsController],
  providers: [UploadsService, UploadsRepository],
  exports: [UploadsService],
})
export class UploadsModule {}
