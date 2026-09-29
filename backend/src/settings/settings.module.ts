import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { Setting } from './entities/setting.entity';
import { Detection } from '../detections/entities/detection.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';

@Module({
  imports: [TypeOrmModule.forFeature([Setting, Detection, Alert]), AiGatewayModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
