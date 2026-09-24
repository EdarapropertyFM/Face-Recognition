import { IsOptional, IsString, Matches } from 'class-validator';

export class CheckFaceFrameDto {
  @IsString()
  @Matches(/^data:image\/(jpeg|jpg|png);base64,/, { message: 'A valid camera frame is required' })
  image_b64!: string;

  /**
   * The person this draft already enrolled during the capture step. Matching
   * it is the applicant recognising themselves, not a duplicate registration.
   */
  @IsString()
  @IsOptional()
  aiPersonId?: string;
}
