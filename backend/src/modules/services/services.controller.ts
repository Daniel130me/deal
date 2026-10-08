import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentCreator } from '../creators/decorators/current-creator.decorator';
import { CreatorProfileGuard, type CreatorRef } from '../creators/guards/creator-profile.guard';
import { ServicesService } from './services.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

/** Owner service catalogue — "me"-scoped like every creator route. */
@Controller('creators/me/services')
@UseGuards(CreatorProfileGuard)
export class CreatorServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  async list(@CurrentCreator() creator: CreatorRef) {
    const services = await this.services.listByCreator(creator.id);
    return { services };
  }

  @Post()
  create(@CurrentCreator() creator: CreatorRef, @Body() dto: CreateServiceDto) {
    return this.services.create(creator.id, dto);
  }
}

/** Item-level edit: PATCH /services/:id (owner-checked inside the service). */
@Controller('services')
@UseGuards(CreatorProfileGuard)
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Patch(':id')
  update(@CurrentCreator() creator: CreatorRef, @Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.services.update(creator.id, id, dto);
  }
}
