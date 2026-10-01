import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from './entities/incident.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class IncidentsService {
  constructor(@InjectRepository(Incident) private readonly incidentRepo: Repository<Incident>, @InjectRepository(Alert) private readonly alertRepo: Repository<Alert>, private readonly realtime: RealtimeService) {}

  async create(dto: CreateIncidentDto) {
    if (dto.alertId) {
      const existing = await this.incidentRepo.findOne({ where: { alertId: dto.alertId } });
      if (existing) throw new BadRequestException('This alert already has an incident');
    }
    const incident = this.incidentRepo.create({ ...dto, id: dto.id ?? `INC-${Date.now()}`, when: dto.when ?? new Date().toISOString(), officer: dto.officer ?? ['System', 'النظام'], status: dto.status ?? 'open', desc: dto.desc ?? ['', ''], att: dto.att ?? [] });
    const saved = await this.incidentRepo.save(incident);
    if (dto.alertId) {
      const alert = await this.alertRepo.findOne({ where: { id: dto.alertId } });
      if (alert) {
        alert.incidentId = saved.id;
        alert.log = [...(alert.log ?? []), ['system', `INCIDENT ${saved.id}`, new Date().toISOString()]];
        await this.alertRepo.save(alert);
      }
    }
    this.realtime.emit('incident.created', { id: saved.id, status: saved.status, alertId: saved.alertId ?? null });
    if (dto.alertId) this.realtime.emit('alert.updated', { id: dto.alertId, status: 'resolved', incidentId: saved.id });
    return saved;
  }

  findAll() {
    return this.incidentRepo.find({ order: { when: 'DESC' } });
  }

  async findOne(id: string) {
    const incident = await this.incidentRepo.findOne({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async update(id: string, dto: UpdateIncidentDto) {
    const incident = await this.findOne(id);
    if (dto.status && !['open', 'review', 'closed'].includes(dto.status)) throw new BadRequestException('Invalid incident status');
    Object.assign(incident, dto);
    const saved = await this.incidentRepo.save(incident);
    this.realtime.emit('incident.updated', { id: saved.id, status: saved.status });
    return saved;
  }

  async remove(id: string) {
    await this.incidentRepo.remove(await this.findOne(id));
    this.realtime.emit('incident.deleted', { id });
    return { id, deleted: true };
  }
}
