import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from './entities/camera.entity';
import { SecretCipherService } from '../security/secret-cipher.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';

/**
 * Keeps unattended recognition running on every enabled camera.
 *
 * Recognition used to run only while somebody had a tile open, so a camera
 * was confirmed alive around the clock but nothing was recognised unless a
 * dashboard happened to be watching. A stranger at 3am was seen by nobody.
 *
 * This reconciles what the AI is monitoring against what the database says
 * should be monitored, on a slow loop: cameras added, enabled, disabled or
 * deleted are picked up without a restart, and monitors lost to an AI
 * restart are started again. The AI shares each capture with any live
 * viewer, so monitoring costs no extra connection to the recorder.
 */
@Injectable()
export class CameraMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CameraMonitorService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  private readonly intervalMs = Number(process.env.CAMERA_MONITOR_INTERVAL_MS) || 60_000;
  /** Off by default: continuous recognition is a real CPU commitment. */
  private readonly enabled = process.env.CAMERA_MONITORING === 'true';

  constructor(
    @InjectRepository(Camera) private readonly cameras: Repository<Camera>,
    private readonly cipher: SecretCipherService,
    private readonly ai: AiGatewayService,
  ) {}

  onModuleInit() {
    if (!this.enabled) {
      this.log.log('continuous recognition disabled (set CAMERA_MONITORING=true to enable)');
      return;
    }
    this.timer = setInterval(() => void this.reconcile(), this.intervalMs);
    this.timer.unref?.();
    // The AI is usually still loading its model when the backend finishes
    // booting, so the first pass waits for the first tick rather than
    // failing every camera immediately.
    this.log.log(`continuous recognition on, reconciling every ${Math.round(this.intervalMs / 1000)}s`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One reconciliation pass: start what is missing, stop what should not be
   * running. Returns what it changed, which makes it testable and gives the
   * log something meaningful to say.
   */
  async reconcile(): Promise<{ started: string[]; stopped: string[]; running: number }> {
    if (this.running) return { started: [], stopped: [], running: 0 };
    this.running = true;
    const started: string[] = [];
    const stopped: string[] = [];
    try {
      const active = await this.ai.listMonitors();
      const activeIds = new Set(active.map((monitor) => monitor.camera_id));

      const wanted = await this.cameras.createQueryBuilder('camera')
        .addSelect('camera.rtspUrlEncrypted')
        .where('camera.enabled = true AND camera."rtspConfigured" = true')
        .getMany();
      const wantedIds = new Set(wanted.map((camera) => camera.id));

      for (const camera of wanted) {
        if (activeIds.has(camera.id) || !camera.rtspUrlEncrypted) continue;
        try {
          await this.ai.startMonitor(camera.id, this.cipher.decrypt(camera.rtspUrlEncrypted), camera.zone);
          started.push(camera.id);
        } catch (error) {
          this.log.warn(`could not watch ${camera.id}: ${error instanceof Error ? error.message : error}`);
        }
      }

      for (const id of activeIds) {
        if (wantedIds.has(id)) continue;
        try {
          await this.ai.stopMonitor(id);
          stopped.push(id);
        } catch {
          // Already gone, or the AI restarted: nothing to undo.
        }
      }

      if (started.length) this.log.log(`watching ${started.join(', ')}`);
      if (stopped.length) this.log.log(`stopped watching ${stopped.join(', ')}`);
      return { started, stopped, running: wantedIds.size };
    } catch (error) {
      this.log.warn(`reconcile failed: ${error instanceof Error ? error.message : error}`);
      return { started, stopped, running: 0 };
    } finally {
      this.running = false;
    }
  }

  /** What the AI reports it is watching, for the admin view. */
  status() {
    return this.ai.listMonitors();
  }
}
