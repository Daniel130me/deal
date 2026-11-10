import { Controller, Get, Param, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { RATE_LIMITS } from '../../common/rate-limit/rate-limit.constants';
import { Public } from '../auth/decorators/public.decorator';
import { FilesService } from './files.service';

/**
 * Capability-link file surface — the CLIENT side of deal files.
 *
 * Same posture as SharedDealsController: the unguessable share token is the
 * credential, routes are @Public() but rate-limited per IP, and only the
 * whitelist projection ever leaves the server. Lives in FilesModule (not
 * DealsModule) so ALL file routes — owner and client — sit behind ONE
 * service that owns the gating policy, and the module dependency stays
 * one-directional (files -> deals for deal context, never the reverse).
 *
 * Gating (files.constants.ts):
 * - PREVIEW files: visible from the first delivery onward.
 * - FINAL files: only after release (deal status FILES_RELEASED/COMPLETED —
 *   statuses reachable only through the approved + fully-paid release gate).
 * Both gates return the same 404 as a missing file: a capability surface must
 * not confirm the existence of resources it is hiding.
 */
@Controller('shared/:token/files')
@UseGuards(ThrottlerGuard)
export class SharedFilesController {
  constructor(private readonly files: FilesService) {}

  @Public()
  @Throttle(RATE_LIMITS.shared.fileRead)
  @Get()
  async list(@Param('token') token: string) {
    return { files: await this.files.listSharedFilesByToken(token) };
  }

  /**
   * Sends only the server-generated derivative through the API. No storage URL
   * or source key reaches the browser. Headers prevent intermediary/browser
   * persistence; UI download controls remain deterrence rather than DRM.
   */
  @Public()
  @Throttle(RATE_LIMITS.shared.fileRead)
  @Get(':fileId/preview')
  async preview(
    @Param('token') token: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const preview = await this.files.getSharedPreviewByToken(token, fileId);
    response.set({
      'Content-Type': preview.mime,
      'Content-Disposition': `inline; filename="${preview.filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-site',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    });
    return new StreamableFile(Buffer.from(preview.bytes));
  }

  @Public()
  @Throttle(RATE_LIMITS.shared.fileRead)
  @Get(':fileId/download-url')
  async downloadUrl(@Param('token') token: string, @Param('fileId') fileId: string) {
    return { download: await this.files.getSharedDownloadUrlByToken(token, fileId) };
  }
}
