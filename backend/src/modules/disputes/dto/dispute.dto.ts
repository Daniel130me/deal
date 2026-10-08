import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DISPUTE_NOTE_MAX } from '../disputes.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /disputes/:id/actions — the platform's dispute pipeline. Resolution
 * decisions belong to the platform team (ADMIN role, enforced by the global
 * RolesGuard); neither party can close a dispute themselves.
 */
export class DisputeActionDto {
  @IsIn(['under-review', 'resolve', 'reject'])
  action!: 'under-review' | 'resolve' | 'reject';

  /** Optional note recorded in the resolution's audit metadata. */
  @IsOptional()
  @IsString()
  @MaxLength(DISPUTE_NOTE_MAX)
  @Transform(trim)
  note?: string;
}
