import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CreatorsModule } from './modules/creators/creators.module';
import { DealsModule } from './modules/deals/deals.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RequestsModule } from './modules/requests/requests.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ServicesModule } from './modules/services/services.module';
import { UsersModule } from './modules/users/users.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

/**
 * Modular monolith: every domain owns a module boundary today so the future
 * microservice split (see docs/target-architecture.md §6) stays cheap.
 * Cross-module access must go through the exported service of a module —
 * never through another module's repositories or raw Prisma models.
 */
@Module({
  imports: [
    ConfigModule,
    HealthModule,
    // Domain boundaries (empty shells in Phase 2, implemented phase by phase)
    AuthModule,
    UsersModule,
    CreatorsModule,
    ServicesModule,
    RequestsModule,
    BookingsModule,
    DealsModule,
    PaymentsModule,
    FilesModule,
    ReviewsModule,
    DisputesModule,
    NotificationsModule,
    WebhooksModule,
  ],
  providers: [
    // Order matters: log the request first, then wrap the response in the envelope.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // First thing every request hits: request-id + logging context.
    consumer.apply(RequestIdMiddleware).forRoutes('{*splat}');
  }
}
