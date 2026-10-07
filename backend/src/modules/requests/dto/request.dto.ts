import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LOCATION_MAX, MAX_MONEY_MINOR } from '../../creators/creators.constants';

/** Plain calendar date (yyyy-mm-dd) — event dates are day-granular in the UI. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 24-hour clock time as the prototype stores it ("10:00"). */
export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const trim = ({ value }: ({ value: unknown })) => (typeof value === 'string' ? value.trim() : value);

/** Client contacts arrive from IG/WhatsApp/referrals — free-form but bounded. */
export class ClientContactBase {
  @IsString()
  @Length(1, 120, { message: 'Client name is required' })
  @Transform(trim)
  clientName!: string;

  @IsString()
  @Length(3, 120, { message: 'A reachable email or phone is required' })
  @Transform(trim)
  clientContact!: string;
}

/** POST /public/:handle/requests — an anonymous visitor asks for a quote. */
export class PublicRequestDto extends ClientContactBase {
  @IsString()
  @Length(1, 64)
  serviceId!: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Event date must be yyyy-mm-dd' })
  eventDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LOCATION_MAX)
  @Transform(trim)
  location?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_MINOR, { message: 'Budget exceeds the supported maximum' })
  budgetMinMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_MINOR, { message: 'Budget exceeds the supported maximum' })
  budgetMaxMinor?: number;

  @IsString()
  @Length(1, 2_000, { message: 'Tell the creator about the project' })
  @Transform(trim)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  @Transform(trim)
  notes?: string;
}

/** POST /requests/:id — creator actions on an incoming request. */
export class RequestActionDto {
  @IsIn(['decline', 'archive'])
  action!: 'decline' | 'archive';
}
