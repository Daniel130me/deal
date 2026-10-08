import { Module } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { R2StorageProvider } from './r2-storage.provider';
import { STORAGE_PROVIDER } from './storage-provider';

/**
 * Storage integration module — binds the StorageProvider PORT to the R2
 * ADAPTER using values from the validated ConfigService. Domain modules
 * inject STORAGE_PROVIDER; nothing outside this folder knows the store is R2.
 */
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useFactory: (config: ConfigService) => new R2StorageProvider(config.r2),
      inject: [ConfigService],
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
