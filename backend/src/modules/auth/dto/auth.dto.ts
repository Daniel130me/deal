import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

/** Phones are stored as entered; this only rejects obvious garbage, not formats. */
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{6,19}$/;

export class SignupDto {
  @IsEmail({}, { message: 'A valid email is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'Phone must be 7-20 digits, optionally starting with +' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;

  // Max 128: Argon2 has no practical limit, but capping input length bounds
  // hashing work per request (DoS surface) before we ever touch crypto.
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password!: string;
}

export class LoginDto {
  @IsString()
  @Length(3, 254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  identifier!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  @Length(1, 512)
  refreshToken!: string;
}
