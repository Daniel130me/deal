import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { DisputesService } from './disputes.service';
import { DisputeActionDto } from './dto/dispute.dto';

/**
 * The platform's dispute desk — ADMIN-only (global RolesGuard enforces it).
 *
 * There is deliberately no POST /disputes: dispute INTAKE is the capability
 * link's dispute action (the anonymous client raising it against their own
 * deal), routed through DisputesService.createClientDispute. Creators have no
 * dispute-raising flow in the product — they see disputes on their deals via
 * the deal detail endpoint and their notification inbox.
 */
@Controller('disputes')
@Roles(UserRole.ADMIN)
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  async list() {
    return { disputes: await this.disputes.list() };
  }

  @Post(':id/actions')
  @HttpCode(HttpStatus.OK) // a pipeline move, not a creation
  async act(@Param('id') id: string, @Body() dto: DisputeActionDto) {
    return { dispute: await this.disputes.act(id, dto) };
  }
}
