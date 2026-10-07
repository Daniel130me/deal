import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';

/**
 * Builds the fully-configured Nest application (no side effects — binding to a
 * port happens in main.ts).
 * Exported so the e2e tests boot the exact same app production runs.
 */
export async function createApp() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Health probes live on fixed root paths; everything else is versioned under /api/v1.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  // Strip unknown keys and reject extra fields on DTOs (defence in depth —
  // never persist or trust data the API contract does not declare).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Browser origins are allow-listed by env — never a wildcard in production.
  app.enableCors({ origin: config.corsOrigins, credentials: true });

  if (!config.isProduction) {
    const documentConfig = new DocumentBuilder()
      .setTitle('DEAL API')
      .setDescription('Escrowed project payments for African creatives. Envelope: { success, data } | { success, error: { code, message } }')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, documentConfig));
  }

  return app;
}
