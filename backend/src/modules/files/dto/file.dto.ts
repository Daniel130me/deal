import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from '../files.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUploadUrlDto {
  /** Deal the file belongs to; ownership is re-checked server-side (never trusted). */
  @IsString()
  @Length(1, 64)
  dealId!: string;

  /** PREVIEW = work-in-progress share; FINAL = the deliverable (gated on release). */
  @IsIn(['PREVIEW', 'FINAL'])
  role!: 'PREVIEW' | 'FINAL';

  /** Original filename, kept for display and the download Content-Disposition. */
  @IsString()
  @Length(1, 255, { message: 'Filename must be between 1 and 255 characters' })
  @Transform(trim)
  filename!: string;

  /** Exact content type the browser will send — the presign signature pins it. */
  @IsIn(ALLOWED_MIME_TYPES, { message: 'File type is not supported' })
  mime!: string;

  /** Declared size for early rejection + UI progress; the stored truth is verified at finalize. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'File cannot be empty' })
  @Max(MAX_FILE_BYTES, { message: 'File exceeds the maximum supported size' })
  sizeBytes?: number;
}

export class FinalizeUploadDto {
  @IsString()
  @Length(1, 64)
  dealId!: string;

  @IsIn(['PREVIEW', 'FINAL'])
  role!: 'PREVIEW' | 'FINAL';

  /** The key exactly as returned by upload-url — verified against the caller's namespace. */
  @IsString()
  @Length(1, 512)
  storageKey!: string;

  /** Must match what upload-url presigned (and therefore what the object carries). */
  @IsIn(ALLOWED_MIME_TYPES, { message: 'File type is not supported' })
  mime!: string;

  /** Display filename (original name as it should appear to users). */
  @IsString()
  @Length(1, 255, { message: 'Filename must be between 1 and 255 characters' })
  @Transform(trim)
  filename!: string;
}
