import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ChannelType, PaymentProvider } from '@prisma/client';
import {
  CHANNEL_VALUE_MAX,
  CREATOR_CRAFTS,
  HANDLE_MAX_LENGTH,
  HANDLE_PATTERN,
  LOCATION_MAX,
  MAX_CHANNELS,
  PROFILE_BIO_MAX,
  PROFILE_NAME_MAX,
} from '../creators.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Payload for POST /creators/me — turns an authenticated user into a creator. */
export class CreateProfileDto {
  @IsString()
  @Length(1, PROFILE_NAME_MAX, { message: 'Name is required' })
  @Transform(trim)
  name!: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(HANDLE_PATTERN, {
    message: `Handle must be 3-${HANDLE_MAX_LENGTH} lowercase letters, numbers or hyphens`,
  })
  handle!: string;

  @IsOptional()
  @IsIn(CREATOR_CRAFTS, { message: 'Craft must be one of the supported DEAL crafts' })
  craft?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LOCATION_MAX)
  @Transform(trim)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_BIO_MAX)
  @Transform(trim)
  bio?: string;

  @IsOptional()
  @IsIn(Object.values(PaymentProvider))
  preferredProvider?: PaymentProvider;
}

/**
 * PATCH /creators/me. Handle is deliberately absent: public URLs and share
 * links reference it, so renaming would silently break them. Same limits as
 * creation; partial by nature (undefined = leave unchanged).
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, PROFILE_NAME_MAX)
  @Transform(trim)
  name?: string;

  @IsOptional()
  @IsIn(CREATOR_CRAFTS, { message: 'Craft must be one of the supported DEAL crafts' })
  craft?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LOCATION_MAX)
  @Transform(trim)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_BIO_MAX)
  @Transform(trim)
  bio?: string;

  @IsOptional()
  @IsIn(Object.values(PaymentProvider))
  preferredProvider?: PaymentProvider;

  @IsOptional()
  @IsBoolean()
  onboarded?: boolean;
}

export class ChannelDto {
  @IsIn(Object.values(ChannelType), { message: 'Unsupported channel type' })
  type!: ChannelType;

  @IsString()
  @Length(1, CHANNEL_VALUE_MAX, { message: 'Channel value is required' })
  @Transform(trim)
  value!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

/** PUT /creators/me/channels — replaces the whole set (matches the prototype's PATCH semantics). */
export class ReplaceChannelsDto {
  @IsArray()
  @ArrayMaxSize(MAX_CHANNELS, { message: `At most ${MAX_CHANNELS} channels are supported` })
  @ValidateNested({ each: true })
  @Type(() => ChannelDto)
  channels!: ChannelDto[];
}
