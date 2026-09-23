import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type RealtimeEvent = { type: string; payload: Record<string, unknown>; at: string };

@Injectable()
export class RealtimeService {
  private readonly subject = new Subject<RealtimeEvent>();
  readonly events$ = this.subject.asObservable();

  emit(type: string, payload: Record<string, unknown> = {}) {
    this.subject.next({ type, payload, at: new Date().toISOString() });
  }
}
