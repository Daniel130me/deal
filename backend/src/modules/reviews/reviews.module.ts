import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

/** Reviews domain boundary — see reviews.service.ts for the boundary contract. */
@Module({
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
