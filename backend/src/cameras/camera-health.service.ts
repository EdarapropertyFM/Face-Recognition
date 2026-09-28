import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from './entities/camera.entity';
import { SecretCipherService } from '../security/secret-cipher.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CamerasService } from './cameras.service';

/**
 * Keeps the recorded state of every camera true without anyone asking.
 *
 * Camera status used to be written only when an operator pressed "Test
 * connection", and nothing ever expired it. A camera tested on Monday still
 * read "online" on Thursday with the DVR unplugged, and a recorder that died
 * overnight was noticed by nobody until someone opened the wall in the
 * morning. On a system that is meant to run continuously that is the whole
 * point missed.
 *
 * So each configured camera is probed on a slow cycle, its result is written
 * down, and a realtime event is emitted -- but only when the verdict actually
 * changes. Emitting on every round would make every open dashboard reload its
 * camera list once a minute forever.
 */
@Injectable()
export class CameraHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CameraHealthService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  /** How often to sweep. Long enough to be cheap, short enough to be useful. */
  private readonly intervalMs = Number(process.env.CAMERA_HEALTH_INTERVAL_MS) || 60_000;
  /** Probing every channel of a recorder at once can overwhelm it. */
  private readonly batchSize = Number(process.env.CAMERA_HEALTH_BATCH) || 2;
  private readonly enabled = process.env.CAMERA_HEALTH_CHECKS !== 'false';

  constructor(
    @InjectRepository(Camera) private readonly cameras: Repository<Camera>,
    private readonly cipher: SecretCipherService,
    private readonly ai: AiGatewayService,
    private readonly realtime: RealtimeService,
    private readonly cameras2: CamerasService,
  ) {}

  onModuleInit() {
    if (!this.enabled) {
      this.log.log('camera health checks disabled (CAMERA_HEALTH_CHECKS=false)');
      return;
    }
    // Not on the first tick: the AI service is usually still loading its
    // model when the backend finishes booting, and probing then would record
    // every camera as down.
    this.timer = setInterval(() => void this.sweep(), this.intervalMs);
    this.timer.unref?.();
    this.log.log(`camera health checks every ${Math.round(this.intervalMs / 1000)}s`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One pass over every configured camera.
   *
   * Skipped entirely if the previous pass is still going, so a slow or
   * unreachable recorder cannot cause sweeps to pile up on each other.
   */
  async sweep(): Promise<{ checked: number; changed: number }> {
    if (this.running) return { checked: 0, changed: 0 };
    this.running = true;
    let checked = 0;
    let changed = 0;
    try {
      const cameras = await this.cameras.find({
        where: { enabled: true, rtspConfigured: true },
        select: { id: true },
      });
      for (let i = 0; i < cameras.length; i += this.batchSize) {
        const batch = cameras.slice(i, i + this.batchSize);
        const results = await Promise.all(batch.map((row) => this.probe(row.id)));
        checked += results.length;
        changed += results.filter(Boolean).length;
      }
    } catch (error) {
      this.log.warn(`health sweep failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.running = false;
    }
    return { checked, changed };
  }

  /** Probe one camera. Returns true when its status changed. */
  private async probe(id: string): Promise<boolean> {
    const camera = await this.cameras.findOne({
      where: { id },
      select: {
        id: true, status: true, streamStatus: true, lastError: true,
        lastHeartbeat: true, last: true, rtspUrlEncrypted: true,
      },
    });
    if (!camera?.rtspUrlEncrypted) return false;

    // Already delivering frames to somebody: that is a stronger liveness
    // signal than a probe, and opening a second RTSP session against the
    // same channel can exhaust the recorder session limit and break the
    // very stream being watched.
    if (this.cameras2.isBeingWatched(id)) {
      if (camera.status !== 'online') {
        await this.cameras.update({ id }, {
          status: 'online', streamStatus: 'ready', lastError: null,
          lastHeartbeat: new Date().toISOString(), last: 'Just now',
        });
        this.realtime.emit('camera.updated', { id, status: 'online', streamStatus: 'ready' });
        return true;
      }
      await this.cameras.update({ id }, { lastHeartbeat: new Date().toISOString() });
      return false;
    }

    const was = camera.status;
    let ok = false;
    let error: string | null = null;
    try {
      const result = await this.ai.probeCamera(this.cipher.decrypt(camera.rtspUrlEncrypted));
      ok = result.ok;
      error = result.ok ? null : result.error || 'Camera connection failed';
    } catch (probeError) {
      // The AI being unreachable says nothing about the camera, so the
      // verdict is left alone rather than blaming the wrong component.
      this.log.debug(`cannot probe ${id}: ${probeError instanceof Error ? probeError.message : probeError}`);
      return false;
    }

    await this.cameras.update({ id }, {
      status: ok ? 'online' : 'offline',
      streamStatus: ok ? 'ready' : 'error',
      lastError: error,
      // Only a success moves the heartbeat: it records when the camera was
      // last proven reachable, which is what the staleness rule reads.
      ...(ok ? { lastHeartbeat: new Date().toISOString(), last: 'Just now' } : {}),
    });

    const now = ok ? 'online' : 'offline';
    if (now === was) return false;
    this.log.log(`camera ${id} is now ${now}${error ? ` (${error})` : ''}`);
    this.realtime.emit('camera.updated', { id, status: now, streamStatus: ok ? 'ready' : 'error' });
    return true;
  }
}
