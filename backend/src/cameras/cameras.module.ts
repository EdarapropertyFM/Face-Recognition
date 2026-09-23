import { Module } from '@nestjs/common';
import { CamerasService } from './cameras.service';
import { CamerasController } from './cameras.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Camera } from './entities/camera.entity';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';

@Module({
  imports: [TypeOrmModule.forFeature([Camera]), AiGatewayModule],
  controllers: [CamerasController],
  providers: [CamerasService],
})
export class CamerasModule {}
