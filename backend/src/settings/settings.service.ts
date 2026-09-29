import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Setting } from './entities/setting.entity';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { Detection } from '../detections/entities/detection.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { RealtimeService } from '../realtime/realtime.service';

export const SYSTEM = 'system';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly log = new Logger(SettingsService.name);
  private purgeTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
    @InjectRepository(Detection) private readonly detections: Repository<Detection>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    private readonly ai: AiGatewayService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit() {
    // Retention is a promise to residents, not a housekeeping nicety: the
    // privacy notice says faces are removed after so many days, so something
    // has to actually remove them.
    this.purgeTimer = setInterval(() => void this.purge(), 60 * 60 * 1000);
    this.purgeTimer.unref?.();
  }

  /** The settings row, created with defaults the first time it is asked for. */
  async get(): Promise<Setting> {
    const existing = await this.settings.findOne({ where: { id: SYSTEM } });
    if (existing) return existing;
    return this.settings.save(this.settings.create({ id: SYSTEM }));
  }

  async update(dto: UpdateSettingDto): Promise<Setting> {
    const current = await this.get();
    Object.assign(current, dto, { id: SYSTEM });
    const saved = await this.settings.save(current);

    // The match threshold belongs to the AI, which does the comparing. A
    // value stored here and never sent would be a dial connected to nothing.
    if (dto.threshold !== undefined) {
      try {
        await this.ai.setMatchThreshold(saved.threshold / 100);
      } catch (error) {
        this.log.warn(`saved, but the AI did not accept the threshold: ${
          error instanceof Error ? error.message : error}`);
      }
    }

    this.realtime.emit('settings.updated', { threshold: saved.threshold });
    return saved;
  }

  /**
   * Delete what has aged out.
   *
   * Sightings and their images go first, then alerts and the audit trail.
   * Returns what it removed so the operator can see the setting doing
   * something rather than taking it on trust.
   */
  async purge(): Promise<{ detections: number; alerts: number; skipped: boolean }> {
    const setting = await this.get();
    if (!setting.purgeEnabled) return { detections: 0, alerts: 0, skipped: true };

    const cutoff = (days: number) =>
      new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    try {
      const sightings = await this.detections.delete({ when: LessThan(cutoff(setting.retStd)) });
      const old = await this.alerts.delete({ when: LessThan(cutoff(setting.retLog)) });
      const removed = { detections: sightings.affected ?? 0, alerts: old.affected ?? 0, skipped: false };

      // The image files outlive their rows unless someone says otherwise.
      if (removed.detections) {
        await this.ai.purgeEvidence(setting.retStd).catch((error) => {
          this.log.warn(`rows purged, images kept: ${
            error instanceof Error ? error.message : error}`);
        });
        this.log.log(`purged ${removed.detections} sighting(s), ${removed.alerts} alert(s)`);
      }
      return removed;
    } catch (error) {
      this.log.warn(`purge failed: ${error instanceof Error ? error.message : error}`);
      return { detections: 0, alerts: 0, skipped: false };
    }
  }
}
