import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CaptureFacesDto {
  /** The five pose captures, in order: front, left, right, step back, better lighting. */
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @Matches(/^data:image\/(jpeg|jpg|png);base64,/, {
    each: true, message: 'Each face photo must be a camera capture',
  })
  images!: string[];

  /** Shown in the AI gallery until approval replaces it with the owner's name. */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;
}
