import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class AlertsService {
  constructor(@InjectRepository(Alert) private readonly alertRepo: Repository<Alert>, private readonly realtime: RealtimeService) {}

  async create(dto: CreateAlertDto) {
    const alert = this.alertRepo.create({ ...dto, id: dto.id ?? `A-${Date.now()}`, when: dto.when ?? new Date().toISOString(), status: dto.status ?? 'new', log: dto.log ?? [] });
    const saved = await this.alertRepo.save(alert);
    this.realtime.emit('alert.created', { id: saved.id, cam: saved.cam, zone: saved.zone, status: saved.status });
    return saved;
  }

  findAll() {
    return this.alertRepo.find({ order: { when: 'DESC' } });
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
