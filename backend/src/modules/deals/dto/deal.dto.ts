import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
import { DATE_PATTERN } from '../../requests/dto/request.dto';
import {
  DEAL_TEXT_MAX,
  DEAL_TITLE_MAX,
  DELIVERABLE_NAME_MAX,
  MAX_DELIVERABLES,
  MAX_INSTALLMENTS,
  MAX_REVISIONS,
} from '../deals.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value;

/**
 * POST /deals — open a draft. Everything commercial is filled in afterwards
 * via PATCH (prototype's two-step wizard), so only the identity of the deal
 * and its client may be provided here.
 */
export class CreateDealDto {
  /** Optional ClientRequest this deal answers; must be owned by the creator. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  requestId?: string;

  @IsOptional()
  @IsString()
  @Length(1, DEAL_TITLE_MAX, { message: 'Title must be between 1 and 200 characters' })
  @Transform(trim)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DEAL_TITLE_MAX)
  @Transform(trim)
  serviceTitle?: string;

  /** Client contacts arrive from IG/WhatsApp/referrals — free-form but bounded. */
  @IsOptional()
  @IsString()
  @Length(1, 120, { message: 'Client name must be between 1 and 120 characters' })
  @Transform(trim)
  clientName?: string;

  @IsOptional()
  @IsString()
  @Length(3, 120, { message: 'A reachable email or phone is required' })
  @Transform(trim)
  clientContact?: string;
}

/**
 * PATCH /deals/:id — the wizard fields. Money is ALWAYS integer kobo
 * (priceMinor); there is no naira float anywhere in the API.
 */
export class UpdateDealDto {
  @IsOptional()
  @IsString()
  @Length(1, DEAL_TITLE_MAX, { message: 'Title must be between 1 and 200 characters' })
  @Transform(trim)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DEAL_TITLE_MAX)
  @Transform(trim)
  serviceTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DEAL_TEXT_MAX)
  @Transform(trim)
  summary?: string;

  /** Personal note shown to the client on the share page. */
  @IsOptional()
  @IsString()
  @MaxLength(DEAL_TEXT_MAX)
  @Transform(trim)
  message?: string;

  /** What is (and is not) included — shown on the share page. */
  @IsOptional()
  @IsString()
  @MaxLength(DEAL_TEXT_MAX)
  @Transform(trim)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LOCATION_MAX)
  @Transform(trim)
  location?: string;

  /** Plain calendar dates (yyyy-mm-dd) — day-granular in the UI. null clears. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Event date must be yyyy-mm-dd' })
  eventDate?: string | null;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Start date must be yyyy-mm-dd' })
  startDate?: string | null;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Due date must be yyyy-mm-dd' })
  dueDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_MINOR, { message: 'Price exceeds the supported maximum' })
  priceMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Deposit percent must be at least 1' })
  @Max(100, { message: 'Deposit percent cannot exceed 100' })
  depositPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_INSTALLMENTS, { message: `Installments cannot exceed ${MAX_INSTALLMENTS}` })
  installmentsCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_REVISIONS, { message: `Revisions cannot exceed ${MAX_REVISIONS}` })
  revisions?: number;

  /** Replace-set of deliverable names — order becomes position. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DELIVERABLES, { message: `A deal can list at most ${MAX_DELIVERABLES} deliverables` })
  @IsString({ each: true })
  @Length(1, DELIVERABLE_NAME_MAX, { each: true, message: 'Deliverable names must be 1-120 characters' })
  @Transform(trimEach)
  deliverables?: string[];

  @IsOptional()
  @Length(1, 120, { message: 'Client name must be between 1 and 120 characters' })
  @Transform(trim)
  clientName?: string;

  @IsOptional()
  @Length(3, 120, { message: 'A reachable email or phone is required' })
  @Transform(trim)
  clientContact?: string;
}

/** POST /deals/:id/actions — creator lifecycle actions (send / deliver / release-files). */
export class DealActionDto {
  @IsIn(['send', 'deliver', 'release-files'])
  action!: 'send' | 'deliver' | 'release-files';

  /** Delivery note for `deliver`; ignored by the other actions. */
  @IsOptional()
  @IsString()
  @MaxLength(DEAL_TEXT_MAX)
  @Transform(trim)
  note?: string;
}

/**
 * POST /shared/:token/actions — anonymous client actions through the
 * capability link. One free-form note field mirrors the prototype; the
 * dispute action additionally REQUIRES it (service-side check) so the
 * resolution team always has a reason on record.
 */
export class SharedDealActionDto {
  @IsIn(['request-changes', 'decline', 'approve', 'complete', 'dispute'])
  action!: 'request-changes' | 'decline' | 'approve' | 'complete' | 'dispute';

  @IsOptional()
  @IsString()
  @MaxLength(DEAL_TEXT_MAX)
  @Transform(trim)
  note?: string;
}
