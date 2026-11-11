import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentCreator } from '../creators/decorators/current-creator.decorator';
import { CreatorProfileGuard, type CreatorRef } from '../creators/guards/creator-profile.guard';
import { DealsService } from './deals.service';
import { CreateDealDto, DealActionDto, RevertDealContractDto, UpdateDealDto } from './dto/deal.dto';

/**
 * Creator's deal surface — "me"-scoped, resolved from the bearer token.
 * Identity never arrives in the URL or body, so cross-creator access is
 * structurally impossible (same posture as requests/bookings in Phase 5).
 */
@Controller('deals')
@UseGuards(CreatorProfileGuard)
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Get()
  async list(@CurrentCreator() creator: CreatorRef) {
    return { deals: await this.deals.listByCreator(creator.id) };
  }

  @Post()
  async create(@CurrentCreator() creator: CreatorRef, @Body() dto: CreateDealDto) {
    return { deal: await this.deals.create(creator.id, dto) };
  }

  @Get(':id')
  async detail(@CurrentCreator() creator: CreatorRef, @Param('id') id: string) {
    return { deal: await this.deals.getOwned(creator.id, id) };
  }

  @Patch(':id')
  async update(@CurrentCreator() creator: CreatorRef, @Param('id') id: string, @Body() dto: UpdateDealDto) {
    return { deal: await this.deals.update(creator.id, id, dto) };
  }

  @Post(':id/contract-revisions/:revisionId/revert')
  @HttpCode(HttpStatus.OK)
  async revertContract(
    @CurrentCreator() creator: CreatorRef,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: RevertDealContractDto,
  ) {
    return { deal: await this.deals.revertContract(creator.id, id, revisionId, dto.expectedVersion) };
  }

  @Post(':id/actions')
  @HttpCode(HttpStatus.OK) // an action mutates state; it creates nothing
  async act(@CurrentCreator() creator: CreatorRef, @Param('id') id: string, @Body() dto: DealActionDto) {
    switch (dto.action) {
      case 'send':
        return { deal: await this.deals.send(creator.id, id) };
      case 'deliver':
        return { deal: await this.deals.deliver(creator.id, id, dto.note) };
      case 'release-files':
        return { deal: await this.deals.releaseFiles(creator.id, id) };
    }
  }
}
