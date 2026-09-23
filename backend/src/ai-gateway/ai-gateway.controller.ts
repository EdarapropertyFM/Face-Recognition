import { Body, Controller, Get, Post, Param } from '@nestjs/common';
import { AiGatewayService } from './ai-gateway.service';
import { Roles } from '../auth/auth.decorators';
import { RecognizeFrameDto } from './dto/recognize-frame.dto';

@Controller('ai')
@Roles('Admin')
export class AiGatewayController {
  constructor(private readonly ai: AiGatewayService) {}
  @Get('health') health() { return this.ai.health(); }
  @Get('persons') persons() { return this.ai.persons(); }
  @Post('recognize') recognize(@Body() body: RecognizeFrameDto) { return this.ai.recognize(body.image_b64); }
  @Post('faces/:faceId/sync') syncFace(@Param('faceId') faceId: string) { return this.ai.syncFace(faceId); }
}
