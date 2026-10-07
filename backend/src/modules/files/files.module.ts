import { Module } from '@nestjs/common';
import { FilesService } from './files.service';

/** Files domain boundary — see files.service.ts for the boundary contract. */
@Module({
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
