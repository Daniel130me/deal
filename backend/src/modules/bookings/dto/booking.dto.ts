import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_PATTERN, TIME_PATTERN } from '../../requests/dto/request.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** POST /public/:handle/bookings — an anonymous visitor books a session slot. */
export class PublicBookingDto {
  @IsString()
  @Length(1, 80, { message: 'Session type is required' })
  @Transform(trim)
  sessionType!: string;

  /** Optional link to a service on the creator's public page. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  serviceId?: string;

  @IsString()
  @Matches(DATE_PATTERN, { message: 'Date must be yyyy-mm-dd' })
  date!: string;

  @IsString()
  @Matches(TIME_PATTERN, { message: 'Time must be a 24-hour clock value like 10:00' })
  time!: string;

  @IsString()
  @Length(1, 120, { message: 'Client name is required' })
  @Transform(trim)
  clientName!: string;

  @IsString()
  @Length(3, 120, { message: 'A reachable email or phone is required' })
  @Transform(trim)
  clientContact!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  @Transform(trim)
  note?: string;
}

/** POST /bookings/:id — creator actions on an incoming booking. */
export class BookingActionDto {
  @IsIn(['confirm', 'decline', 'complete', 'cancel'])
  action!: 'confirm' | 'decline' | 'complete' | 'cancel';
}
