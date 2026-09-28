import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { Face } from '../faces/entities/face.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { describeCamera, describeSubject } from '../detections/subject';
import { Detection } from '../detections/entities/detection.entity';
import { StreamTokenService } from '../security/stream-token.service';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert) private readonly alertRepo: Repository<Alert>,
    @InjectRepository(Face) private readonly faceRepo: Repository<Face>,
    @InjectRepository(Detection) private readonly detectionRepo: Repository<Detection>,
    private readonly tokens: StreamTokenService,
    @InjectRepository(Camera) private readonly cameraRepo: Repository<Camera>,
    private readonly realtime: RealtimeService,
  ) {}

  async create(dto: CreateAlertDto) {
    const alert = this.alertRepo.create({ ...dto, id: dto.id ?? `A-${Date.now()}`, when: dto.when ?? new Date().toISOString(), status: dto.status ?? 'new', log: dto.log ?? [] });
    const saved = await this.alertRepo.save(alert);
    this.realtime.emit('alert.created', { id: saved.id, cam: saved.cam, zone: saved.zone, status: saved.status });
    return saved;
  }

  /** Alerts with who was seen (name, or Stranger) and where (building, camera). */
  async findAll() {
    const [alerts, faces, cameras] = await Promise.all([
      this.alertRepo.find({ order: { when: 'DESC' }, take: 500 }),
      this.faceRepo.find(),
      this.cameraRepo.find(),
    ]);
    const faceById = new Map(faces.map((f) => [f.id, f]));
    const camById = new Map(cameras.map((c) => [c.id, c]));
    const shots = await this.snapshotsFor(alerts);
    return alerts.map((a) => {
      const snapshot = shots.get(a.face) ?? null;
      return {
        ...a,
        subject: describeSubject(a.face, faceById.get(a.face)),
        camera: describeCamera(a.cam, camById.get(a.cam)),
        // The face this alert is about. An operator deciding whether to act
        // needs to see who it was, not just that somebody was seen.
        snapshot,
        snapshotToken: snapshot ? this.tokens.issue(snapshot, 3600) : null,
      };
    });
  }

  /**
   * The most recent saved face per subject.
   *
   * Looked up in one query rather than per alert: a busy night produces
   * hundreds of alerts and one round trip each would be the slowest thing
   * on the page.
   */
  private async snapshotsFor(alerts: Alert[]): Promise<Map<string, string>> {
    const faceIds = [...new Set(alerts.map((a) => a.face).filter(Boolean))];
    if (!faceIds.length) return new Map();
    const rows = await this.detectionRepo.createQueryBuilder('d')
      .select('d.face', 'face').addSelect('MAX(d.when)', 'when')
      .addSelect('MAX(d.snapshot)', 'snapshot')
      .where('d.face IN (:...faceIds)', { faceIds })
      .andWhere('d.snapshot IS NOT NULL')
      .groupBy('d.face')
      .getRawMany<{ face: string; snapshot: string }>();
    return new Map(rows.map((r) => [r.face, r.snapshot]));
  }

  async findOne(id: string) {
    const alert = await this.alertRepo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  async update(id: string, dto: UpdateAlertDto) {
    const alert = await this.findOne(id);
    if (dto.status && dto.status !== alert.status) {
      const allowed: Record<string, string[]> = { new: ['ack', 'false'], ack: ['actioned', 'false'], actioned: ['resolved', 'false'] };
      if (!allowed[alert.status]?.includes(dto.status)) throw new BadRequestException(`Cannot move alert from ${alert.status} to ${dto.status}`);
      alert.status = dto.status;
      alert.log = [...(alert.log ?? []), [dto.actor ?? 'system', dto.status.toUpperCase(), new Date().toISOString()]];
    }
    Object.assign(alert, { ...dto, actor: undefined });
    const saved = await this.alertRepo.save(alert);
    this.realtime.emit('alert.updated', { id: saved.id, status: saved.status, incidentId: saved.incidentId ?? null });
    return saved;
  }

  async remove(id: string) {
    await this.alertRepo.remove(await this.findOne(id));
    this.realtime.emit('alert.deleted', { id });
    return { id, deleted: true };
  }
}
