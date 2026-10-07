import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Service } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

/**
 * Services domain boundary — owning phase: 5.
 *
 * Owns the Service table. Every mutating call takes the acting creator's
 * profile id and scopes the query by it, so ownership ("is this service
 * mine?") is enforced by the query itself — a foreign or missing row is the
 * same 404, never a 403 (no existence disclosure).
 */
@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Owner listing — includes inactive services (the creator manages them). */
  listByCreator(creatorId: string): Promise<Service[]> {
    return this.prisma.service.findMany({ where: { creatorId }, orderBy: { createdAt: 'desc' } });
  }

  /** Public listing for a creator page — active services only. */
  listActiveByCreator(creatorId: string): Promise<Service[]> {
    return this.prisma.service.findMany({
      where: { creatorId, isActive: true },
      orderBy: [{ isPopular: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Resolves a service an anonymous submission may reference: it must exist,
   * be active, AND belong to the creator being submitted to. Used by the
   * requests/bookings domains to validate public form input.
   */
  findActiveOwned(serviceId: string, creatorId: string): Promise<Service | null> {
    return this.prisma.service.findFirst({ where: { id: serviceId, creatorId, isActive: true } });
  }

  create(creatorId: string, dto: CreateServiceDto): Promise<Service> {
    return this.prisma.service.create({
      data: {
        creatorId,
        title: dto.title,
        description: dto.description,
        startingPriceMinor: dto.startingPriceMinor,
        duration: dto.duration ?? null,
        isPopular: dto.isPopular ?? false,
        includes: this.cleanIncludes(dto.includes),
      },
    });
  }

  async update(creatorId: string, serviceId: string, dto: UpdateServiceDto): Promise<Service> {
    // findFirst scoped by owner: missing and foreign resolve identically.
    const existing = await this.prisma.service.findFirst({ where: { id: serviceId, creatorId }, select: { id: true } });
    if (!existing) {
      throw new HttpException({ code: 'SERVICE_NOT_FOUND', message: 'Service not found' }, HttpStatus.NOT_FOUND);
    }
    return this.prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startingPriceMinor !== undefined && { startingPriceMinor: dto.startingPriceMinor }),
        ...(dto.duration !== undefined && { duration: dto.duration }),
        ...(dto.isPopular !== undefined && { isPopular: dto.isPopular }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.includes !== undefined && { includes: this.cleanIncludes(dto.includes) }),
      },
    });
  }

  /** Trims include lines and drops empties so the stored array stays presentable. */
  private cleanIncludes(includes: string[] | undefined): string[] {
    return (includes ?? []).map((line) => line.trim()).filter((line) => line.length > 0);
  }
}
