import { Module } from '@nestjs/common';
import { CamerasService } from './cameras.service';
import { CameraHealthService } from './camera-health.service';
import { CameraMonitorService } from './camera-monitor.service';
import { CamerasController } from './cameras.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Camera } from './entities/camera.entity';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';

@Module({
  imports: [TypeOrmModule.forFeature([Camera]), AiGatewayModule],
  controllers: [CamerasController],
  providers: [CamerasService, CameraHealthService, CameraMonitorService],
})
export class CamerasModule {}
