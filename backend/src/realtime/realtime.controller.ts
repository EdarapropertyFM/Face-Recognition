import { Controller, MessageEvent, Post, Query, Req, Sse } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { Observable, map } from 'rxjs';
import { RealtimeService } from './realtime.service';
import { RealtimeTokenService } from './realtime-token.service';

@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService, private readonly tokens: RealtimeTokenService) {}

  @Post('token')
  token(@Req() request: { user: { u: string; role: string } }) {
    return { token: this.tokens.issue(request.user.u, request.user.role), expiresIn: 300 };
  }

  @Sse('events')
  @Public()
  events(@Query('token') token: string): Observable<MessageEvent> {
    this.tokens.verify(token || '');
    return this.realtime.events$.pipe(map((event) => ({ type: 'stmc', data: JSON.stringify(event) })));
  }
}
