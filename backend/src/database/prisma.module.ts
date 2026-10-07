import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global Prisma access — domain modules inject PrismaService directly. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
