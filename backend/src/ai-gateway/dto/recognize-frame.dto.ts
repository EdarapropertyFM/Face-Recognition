import { IsString, Matches } from 'class-validator';

export class RecognizeFrameDto {
  @IsString()
  @Matches(/^data:image\/(jpeg|jpg|png);base64,/, { message: 'A valid camera frame is required' })
  image_b64!: string;
}
