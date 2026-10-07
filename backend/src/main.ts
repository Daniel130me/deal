import { logJson } from './common/logger/json-logger';
import { createApp } from './app';
import { ConfigService } from './config/config.service';

/**
 * Process entrypoint — the ONLY side effectful module.
 * Application construction lives in app.ts so tests can boot the same app
 * without triggering a server bind.
 */
async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(ConfigService);
  await app.listen(config.port);
  logJson('log', 'bootstrap', `DEAL API listening on port ${config.port}`, {
    port: config.port,
    environment: config.nodeEnv,
  });
}

void bootstrap();
