import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentCreator } from '../creators/decorators/current-creator.decorator';
import { CreatorProfileGuard, type CreatorRef } from '../creators/guards/creator-profile.guard';
import { RequestsService } from './requests.service';
import { RequestActionDto } from './dto/request.dto';

/** Creator's request inbox — "me"-scoped, resolved from the bearer token. */
@Controller('creators/me/requests')
@UseGuards(CreatorProfileGuard)
export class CreatorRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  async list(@CurrentCreator() creator: CreatorRef) {
    return { requests: await this.requests.listByCreator(creator.id) };
  }
}

/** Item-level access + actions: ownership enforced inside the service (404 for foreign rows). */
@Controller('requests')
@UseGuards(CreatorProfileGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get(':id')
  async detail(@CurrentCreator() creator: CreatorRef, @Param('id') id: string) {
    return { request: await this.requests.getOwned(creator.id, id) };
  }

  @Post(':id')
  @HttpCode(HttpStatus.OK) // an action mutates state; it creates nothing
  async act(@CurrentCreator() creator: CreatorRef, @Param('id') id: string, @Body() dto: RequestActionDto) {
    return { request: await this.requests.act(creator.id, id, dto) };
  }
}
