import {
  Controller, Get, Post, Delete, Param, Query, Body, Req,
  UploadedFile, UploadedFiles, UseInterceptors, UseGuards,
  StreamableFile, Res, NotFoundException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiQuery, ApiHeader } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { UploadsService } from './uploads.service';
import { UploadQueryDto } from './dto/upload-query.dto';
import { UploadContextDto } from './dto/upload-context.dto';
import { multerOptionsFor } from '../../common/multer/multer.config';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { IAuthedRequest } from '../../common/contracts';

/**
 * V3 (v3-file-upload) — upload endpoints.
 *
 * The multer middleware is applied per-route through the FileInterceptor
 * family, with options built from that route's category policy. That is why
 * there is no single global multer config: a 50MB deliverable and a 2MB avatar
 * need genuinely different limits.
 */
@ApiTags('Uploads')
@Controller('uploads')
@UseGuards(RoleGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  // ── Write ───────────────────────────────────────────────────────────────

  @Post('deliverable')
  @Roles('worker', 'superuser')
  @ApiHeader({ name: 'role', required: true })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload milestone deliverable files (max 10)' })
  @UseInterceptors(FilesInterceptor('files', 10, multerOptionsFor('deliverables')))
  uploadDeliverable(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() context: UploadContextDto,
    @Req() req: IAuthedRequest,
  ) {
    return this.uploadsService.record(files, 'deliverables', context, req.user);
  }

  @Post('expert-document')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an expert application résumé and/or certificate' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'resume', maxCount: 1 },
        { name: 'certificate', maxCount: 1 },
      ],
      // Both fields ride on the same interceptor, so the wider policy applies
      // here and each field's type is checked below.
      multerOptionsFor('certificates'),
    ),
  )
  async uploadExpertDocument(
    @UploadedFiles() files: { resume?: Express.Multer.File[]; certificate?: Express.Multer.File[] },
    @Body() context: UploadContextDto,
    @Req() req: IAuthedRequest,
  ) {
    const out: unknown[] = [];

    // Per-field enforcement. The interceptor applies a single multer config to
    // both fields, so it can only enforce the looser policy — without this a
    // PNG would be accepted as a PDF-only résumé.
    if (files?.resume?.length) {
      for (const f of files.resume) await this.uploadsService.assertMatchesPolicy(f, 'resumes');
      out.push(...this.uploadsService.record(files.resume, 'resumes', context, req.user));
    }
    if (files?.certificate?.length) {
      for (const f of files.certificate) await this.uploadsService.assertMatchesPolicy(f, 'certificates');
      out.push(...this.uploadsService.record(files.certificate, 'certificates', context, req.user));
    }
    return out;
  }

  @Post('avatar')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a profile picture' })
  @UseInterceptors(FileInterceptor('file', multerOptionsFor('avatars')))
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Body() context: UploadContextDto,
    @Req() req: IAuthedRequest,
  ) {
    return this.uploadsService.record(file ? [file] : [], 'avatars', context, req.user)[0];
  }

  @Post('attachment')
  @Roles('client', 'worker', 'expert', 'superuser')
  @ApiHeader({ name: 'role', required: true })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a workroom message attachment' })
  @UseInterceptors(FileInterceptor('file', multerOptionsFor('attachments')))
  uploadAttachment(
    @UploadedFile() file: Express.Multer.File,
    @Body() context: UploadContextDto,
    @Req() req: IAuthedRequest,
  ) {
    return this.uploadsService.record(file ? [file] : [], 'attachments', context, req.user)[0];
  }

  // ── Read ────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List uploaded files' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'ownerId', required: false })
  @ApiQuery({ name: 'taskId', required: false })
  @ApiQuery({ name: 'milestoneId', required: false })
  findAll(@Query() query: UploadQueryDto) {
    return this.uploadsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get upload metadata by id' })
  findOne(@Param('id') id: string) {
    return this.uploadsService.findById(id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the file' })
  download(@Param('id') id: string, @Res({ passthrough: true }) res: Response): StreamableFile {
    const meta = this.uploadsService.findById(id);
    const path = this.uploadsService.absolutePathFor(meta);

    if (!existsSync(path)) {
      throw new NotFoundException('The file is recorded but missing from disk.');
    }

    // attachment + nosniff so an uploaded .html or .svg can never execute as a
    // document on our origin.
    res.set({
      'Content-Type': meta.mimetype || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(meta.originalName)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': String(meta.size),
    });

    return new StreamableFile(createReadStream(path));
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an upload (owner or superuser)' })
  remove(@Param('id') id: string, @Req() req: IAuthedRequest) {
    return this.uploadsService.remove(id, req.user);
  }
}
