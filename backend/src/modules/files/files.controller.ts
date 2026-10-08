import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentCreator } from '../creators/decorators/current-creator.decorator';
import { CreatorProfileGuard, type CreatorRef } from '../creators/guards/creator-profile.guard';
import { FilesService } from './files.service';
import { CreateUploadUrlDto, FinalizeUploadDto } from './dto/file.dto';

/**
 * Creator's file surface — "me"-scoped, resolved from the bearer token.
 *
 * Two-step presigned upload (no bytes ever flow through this API):
 *   1. POST /files/upload-url  -> { uploadUrl, storageKey, mime, expiresIn }
 *   2. browser PUTs the file to uploadUrl with EXACTLY the returned
 *      Content-Type (the presign signature pins it — a mismatching PUT fails)
 *   3. POST /files/finalize    -> verifies the stored object server-side and
 *      creates the FileAsset row
 *
 * POST finalize returns 201 (it creates the asset); upload-url is a 201 as
 * well — Nest's default — because it creates a pending upload resource.
 */
@Controller('files')
@UseGuards(CreatorProfileGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload-url')
  async uploadUrl(@CurrentCreator() creator: CreatorRef, @Body() dto: CreateUploadUrlDto) {
    return { upload: await this.files.createUploadUrl(creator.id, dto) };
  }

  @Post('finalize')
  async finalize(@CurrentCreator() creator: CreatorRef, @Body() dto: FinalizeUploadDto) {
    return { file: await this.files.finalizeUpload(creator.id, dto) };
  }

  @Get(':id/download-url')
  async downloadUrl(@CurrentCreator() creator: CreatorRef, @Param('id') id: string) {
    return { download: await this.files.getOwnerDownloadUrl(creator.id, id) };
  }
}
