import { Global, Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';
import { RealtimeTokenService } from './realtime-token.service';

@Global()
@Module({ controllers: [RealtimeController], providers: [RealtimeService, RealtimeTokenService], exports: [RealtimeService] })
export class RealtimeModule {}
