import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';

/**
 * Builds the fully-configured Nest application (no side effects — binding to a
 * port happens in main.ts).
 * Exported so the e2e tests boot the exact same app production runs.
 */
export async function createApp() {
  // rawBody: true — webhook signature verification needs the EXACT bytes the
  // provider signed (Paystack HMACs the raw body); the parsed body alone is
  // not sufficient evidence.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  // Make the parser ceiling explicit. This is especially important for public
  // webhook routes: signatures establish authenticity, not payload size.
  const bodyLimit = `${config.maxJsonBodyKb}kb`;
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  // API responses carry identity, deal and payment data. Keep them out of
  // browser/intermediary caches and apply a small, dependency-free baseline of
  // response hardening headers. TLS/HSTS is owned by the public frontend/proxy.
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
  });

  // Rate limiting keys on the client IP. Proxy trust is deployment-specific:
  // trusting X-Forwarded-For on a directly exposed server lets an attacker
  // rotate a forged header and bypass throttling, so the default is zero.
  app.getHttpAdapter().getInstance().set('trust proxy', config.trustProxyHops);

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
