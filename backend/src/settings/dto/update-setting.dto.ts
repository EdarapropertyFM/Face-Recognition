import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateSettingDto {
  /**
   * Match threshold as a percentage. Bounded deliberately: below ~25 the
   * model matches almost anyone to anyone, and above ~70 nothing matches at
   * all on real camera footage. Letting an operator set 5 or 95 would look
   * like a working control while quietly breaking recognition.
   */
  @IsOptional() @IsInt() @Min(25) @Max(70)
  threshold?: number;

  /** Days to keep sightings and their images. */
  @IsOptional() @IsInt() @Min(1) @Max(3650)
  retStd?: number;

  /** Days to keep alerts and the audit trail. */
  @IsOptional() @IsInt() @Min(1) @Max(3650)
  retLog?: number;

  @IsOptional() @IsBoolean()
  alertOwners?: boolean;

  @IsOptional() @IsBoolean()
  alertStrangers?: boolean;

  @IsOptional() @IsBoolean()
  purgeEnabled?: boolean;
}
