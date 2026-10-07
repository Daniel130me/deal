import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';

/**
 * Global configuration module — every domain module can inject ConfigService
 * without importing anything.
 */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
