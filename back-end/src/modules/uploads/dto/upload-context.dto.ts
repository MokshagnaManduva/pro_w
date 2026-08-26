import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * V3 — the non-file form fields sent alongside an upload.
 *
 * Sent as multipart text parts, so everything arrives as a string; there are
 * no numeric or boolean coercions to worry about here.
 */
export class UploadContextDto {
  @ApiPropertyOptional({ example: 't1', description: 'Task this file belongs to' })
  @IsOptional() @IsString()
  taskId?: string;

  @ApiPropertyOptional({ example: 'm3', description: 'Milestone this file belongs to' })
  @IsOptional() @IsString()
  milestoneId?: string;

  @ApiPropertyOptional({ example: 'u5', description: 'Uploader id (falls back to the authenticated user)' })
  @IsOptional() @IsString()
  ownerId?: string;
}
