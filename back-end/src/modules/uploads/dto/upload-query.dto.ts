import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UPLOAD_CATEGORIES } from '../../../common/multer/upload-categories';
import type { UploadCategory } from '../../../common/contracts';

/** V3 — filters for GET /uploads. */
export class UploadQueryDto {
  @ApiPropertyOptional({ enum: UPLOAD_CATEGORIES })
  @IsOptional() @IsIn(UPLOAD_CATEGORIES)
  category?: UploadCategory;

  @ApiPropertyOptional({ example: 'u5' })
  @IsOptional() @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ example: 't1' })
  @IsOptional() @IsString()
  taskId?: string;

  @ApiPropertyOptional({ example: 'm3' })
  @IsOptional() @IsString()
  milestoneId?: string;
}
