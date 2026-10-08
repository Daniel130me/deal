import { Module } from '@nestjs/common';
import { CreatorsModule } from '../creators/creators.module';
import { DealsModule } from '../deals/deals.module';
import { StorageModule } from '../../integrations/storage/storage.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { SharedFilesController } from './shared-files.controller';

/**
 * Files domain boundary (implemented in Phase 7).
 *
 * Owns the FileAsset table and the storage integration (StorageProvider port
 * -> R2 adapter, integrations/storage). Imports DealsModule for deal context
 * (ownership proofs + capability-token resolution) and CreatorsModule for the
 * profile guard — ONE direction only: deals never depend on files, which
 * keeps the future microservice split (File service talks to Deal service)
 * cheap (docs/target-architecture.md §6).
 *
 * Exports FilesService for sibling modules that need file data through a
 * service call rather than this module's tables.
 */
@Module({
  imports: [CreatorsModule, DealsModule, StorageModule],
  controllers: [FilesController, SharedFilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
