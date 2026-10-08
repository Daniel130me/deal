import { Controller, Get, Param, UseGuards } from '@nestjs/common';
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

  @Public()
  @Throttle(RATE_LIMITS.shared.fileRead)
  @Get(':fileId/download-url')
  async downloadUrl(@Param('token') token: string, @Param('fileId') fileId: string) {
    return { download: await this.files.getSharedDownloadUrlByToken(token, fileId) };
  }
}
