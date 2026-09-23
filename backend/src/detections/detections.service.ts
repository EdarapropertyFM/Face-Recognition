import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Detection } from './entities/detection.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { Setting } from '../settings/entities/setting.entity';
import { Face } from '../faces/entities/face.entity';
import { CreateDetectionDto } from './dto/create-detection.dto';
import { UpdateDetectionDto } from './dto/update-detection.dto';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class DetectionsService {
  constructor(@InjectRepository(Detection) private detections: Repository<Detection>, @InjectRepository(Alert) private alerts: Repository<Alert>, @InjectRepository(Setting) private settings: Repository<Setting>, @InjectRepository(Face) private faces: Repository<Face>, private readonly realtime: RealtimeService) {}

  async create(dto: CreateDetectionDto) {
    const matchedFace = dto.aiPersonId ? await this.faces.findOne({ where: { aiPersonId: dto.aiPersonId } }) : null;
    const { aiPersonId, ...input } = dto;
    const detection = await this.detections.save(this.detections.create({ ...input, face: matchedFace?.id ?? input.face, type: matchedFace?.type ?? input.type, when: input.when ?? new Date().toISOString(), decision: input.decision ?? 'unknown' }));
    const alert = await this.maybeCreateAlert(detection);
    this.realtime.emit('detection.created', { id: detection.id, cam: detection.cam, zone: detection.zone, type: detection.type, decision: detection.decision });
    if (alert) this.realtime.emit('alert.created', { id: alert.id, cam: alert.cam, zone: alert.zone, status: alert.status, type: detection.type });
    return { detection, alertCreated: Boolean(alert), alert };
  }

  findAll() {
    return this.detections.find({ order: { when: 'DESC' }, take: 100 });
  }

  async findOne(id: string) {
    const detection = await this.detections.findOne({ where: { id } });
    if (!detection) throw new NotFoundException('Detection not found');
    return detection;
  }

  async update(id: string, updateDetectionDto: UpdateDetectionDto) {
    const detection = await this.findOne(id);
    Object.assign(detection, updateDetectionDto);
    return this.detections.save(detection);
  }

  async remove(id: string) {
    return this.detections.remove(await this.findOne(id));
  }

  private async maybeCreateAlert(detection: Detection) {
    const setting = await this.settings.findOne({ where: { id: 'system' } });
    const watch = detection.type === 'watch';
    const unknown = detection.type === 'unknown' || detection.decision === 'unknown';
    if (!setting || detection.conf < setting.threshold || (watch && !setting.alertWatch) || (unknown && !setting.alertStrangers) || (!watch && !unknown)) return null;
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const duplicate = await this.alerts.createQueryBuilder('alert').where('alert.cam = :cam AND alert.face IS NOT DISTINCT FROM :face AND alert.status IN (:...statuses) AND alert.when >= :since', { cam: detection.cam, face: detection.face ?? null, statuses: ['new', 'ack', 'actioned'], since }).getOne();
    if (duplicate) return duplicate;
    return this.alerts.save(this.alerts.create({ id: `A-${Date.now()}`, face: detection.face ?? 'unknown', cam: detection.cam, zone: detection.zone, when: detection.when, conf: detection.conf, status: 'new', log: [['ai', 'CREATED', new Date().toISOString()]] }));
  }
}
