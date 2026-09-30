import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * A vehicle on a registration.
 *
 * The licence is required, not optional: a car is only allowed through the
 * gate because its papers were checked, so a record without them cannot be
 * acted on. Enforced here as well as in the browser, because the form is
 * public and client-side validation is a convenience, not a control.
 */
export class VehicleDto {
  @IsString() @MinLength(3) @MaxLength(32)
  plate: string;

  @IsString() @MinLength(2) @MaxLength(32)
  color: string;

  @IsOptional() @IsString() @MaxLength(64)
  make?: string;

  @IsString()
  @Matches(/^(data:image\/(jpeg|png|webp);base64,|asset:\/\/)/, {
    message: 'Each vehicle must have its licence photo attached',
  })
  licence: string;

  @IsOptional() @IsString() @MaxLength(180)
  licenceName?: string;
}
