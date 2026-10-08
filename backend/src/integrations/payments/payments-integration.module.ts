import { Module } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { FlutterwaveGateway } from './flutterwave.gateway';
import { PaystackGateway } from './paystack.gateway';

/**
 * Payments integration module — constructs the gateway ADAPTERS from the
 * validated ConfigService. Domain modules inject the concrete gateways they
 * need; nothing outside this folder knows the rails' HTTP details.
 *
 * Paystack is constructed ONLY when a secret key is configured — absence of the
 * key keeps the rail dormant (the service maps a missing gateway to an explicit
 * 503, never a silent fallback to another rail).
 */
@Module({
  providers: [
    {
      provide: FlutterwaveGateway,
      useFactory: (config: ConfigService) => new FlutterwaveGateway(config.flutterwave),
      inject: [ConfigService],
    },
    {
      provide: PaystackGateway,
      useFactory: (config: ConfigService) =>
        config.paystack ? new PaystackGateway(config.paystack) : null,
      inject: [ConfigService],
    },
  ],
  exports: [FlutterwaveGateway, PaystackGateway],
})
export class PaymentsIntegrationModule {}
