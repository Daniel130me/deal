import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_MONEY_MINOR } from '../../creators/creators.constants';

export class CreateServiceDto {
  @IsString()
  @Length(1, 120, { message: 'Service title is required' })
  title!: string;

  @IsString()
  @Length(1, 2_000, { message: 'Describe what the service covers' })
  description!: string;

  /**
   * Starting price in kobo (integer minor units — the server-side money
   * contract; naira conversion is a display concern of the client).
   */
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Starting price must be at least 1 kobo' })
  @Max(MAX_MONEY_MINOR, { message: 'Starting price exceeds the supported maximum' })
  startingPriceMinor!: number;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  duration?: string;

  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(10, { message: 'At most 10 include lines' })
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  includes?: string[];
}

/** PATCH /services/:id — partial edit (title/price/copy) + visibility toggles. */
export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2_000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Starting price must be at least 1 kobo' })
  @Max(MAX_MONEY_MINOR, { message: 'Starting price exceeds the supported maximum' })
  startingPriceMinor?: number;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  duration?: string;

  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(10, { message: 'At most 10 include lines' })
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  includes?: string[];
}
