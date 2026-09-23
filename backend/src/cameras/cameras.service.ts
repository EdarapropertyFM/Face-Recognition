import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from './entities/camera.entity';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';
import { SecretCipherService } from '../security/secret-cipher.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { randomUUID } from 'crypto';
import { StreamTokenService } from '../security/stream-token.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class CamerasService {
  constructor(
    @InjectRepository(Camera) private readonly cameraRepo: Repository<Camera>,
    private readonly cipher: SecretCipherService,
    private readonly ai: AiGatewayService,
    private readonly streamTokens: StreamTokenService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(dto: CreateCameraDto) {
    if (await this.cameraRepo.exists({ where: { id: dto.id } })) throw new ConflictException('Camera ID already exists');
    const camera = this.cameraRepo.create({
      id: dto.id.trim(), displayName: dto.displayName.trim(), zone: dto.zone,
      buildingCode: dto.buildingCode?.trim() || null, location: dto.location?.trim() || null,
      rtspUrlEncrypted: this.cipher.encrypt(dto.rtspUrl.trim()), rtspConfigured: true,
      playbackId: randomUUID(), codec: dto.codec || 'unknown', enabled: dto.enabled ?? true,
      status: 'offline', streamStatus: 'untested', det: 0, last: 'Never',
      lastHeartbeat: null, lastError: null,
    });
    const saved = await this.cameraRepo.save(camera);
    this.realtime.emit('camera.created', { id: saved.id, status: saved.status, configured: saved.rtspConfigured });
    return this.toPublic(saved);
  }

  async findAll() {
    return this.cameraRepo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: string) {
    const camera = await this.cameraRepo.findOne({ where: { id } });
    if (!camera) throw new NotFoundException('Camera not found');
    return this.toPublic(camera);
  }

  async update(id: string, updateCameraDto: UpdateCameraDto) {
    const camera = await this.findWithSecret(id);
    const { rtspUrl, id: ignoredId, ...values } = updateCameraDto;
    void ignoredId;
    Object.assign(camera, values);
    if (rtspUrl) {
      camera.rtspUrlEncrypted = this.cipher.encrypt(rtspUrl.trim());
      camera.rtspConfigured = true;
      camera.streamStatus = 'untested';
      camera.status = 'offline';
      camera.lastError = null;
    }
    const saved = await this.cameraRepo.save(camera);
    this.realtime.emit('camera.updated', { id: saved.id, status: saved.status, configured: saved.rtspConfigured });
    return this.toPublic(saved);
  }

  async remove(id: string) {
    await this.cameraRepo.remove(await this.findWithSecret(id));
    this.realtime.emit('camera.deleted', { id });
    return { id, deleted: true };
  }

  async testConnection(id: string) {
    const camera = await this.findWithSecret(id);
    if (!camera.rtspUrlEncrypted) throw new ConflictException('Camera has no RTSP source configured');
    try {
      const result = await this.ai.probeCamera(this.cipher.decrypt(camera.rtspUrlEncrypted));
      camera.status = result.ok ? 'online' : 'offline';
      camera.streamStatus = result.ok ? 'ready' : 'error';
      camera.lastHeartbeat = result.ok ? new Date().toISOString() : camera.lastHeartbeat;
      camera.last = result.ok ? 'Just now' : camera.last;
      camera.lastError = result.ok ? null : result.error || 'Camera connection failed';
      await this.cameraRepo.save(camera);
      this.realtime.emit('camera.updated', { id: camera.id, status: camera.status, streamStatus: camera.streamStatus });
      return { ...result, cameraId: camera.id };
    } catch (error) {
      camera.status = 'offline';
      camera.streamStatus = 'error';
      camera.lastError = error instanceof Error ? error.message : 'Camera connection failed';
      await this.cameraRepo.save(camera);
      this.realtime.emit('camera.updated', { id: camera.id, status: camera.status, streamStatus: camera.streamStatus });
      throw error;
    }
  }

  async createStreamToken(id: string) {
    const camera = await this.findWithSecret(id);
    if (!camera.enabled) throw new ConflictException('Camera is disabled');
    if (!camera.rtspConfigured || !camera.rtspUrlEncrypted) throw new ConflictException('Camera has no RTSP source configured');
    const expiresIn = 300;
    return {
      playbackId: camera.playbackId,
      token: this.streamTokens.issue(camera.playbackId, expiresIn),
      expiresIn,
    };
  }

  async openStream(playbackId: string, token: string, signal: AbortSignal) {
    this.streamTokens.verify(token, playbackId);
    const camera = await this.cameraRepo.createQueryBuilder('camera').addSelect('camera.rtspUrlEncrypted')
      .where('camera.playbackId = :playbackId', { playbackId }).getOne();
    if (!camera) throw new NotFoundException('Camera stream not found');
    if (!camera.enabled || !camera.rtspUrlEncrypted) throw new ConflictException('Camera stream is unavailable');
    return this.ai.streamCamera(this.cipher.decrypt(camera.rtspUrlEncrypted), signal);
  }

  private async findWithSecret(id: string) {
    const camera = await this.cameraRepo.createQueryBuilder('camera')
      .addSelect('camera.rtspUrlEncrypted').where('camera.id = :id', { id }).getOne();
    if (!camera) throw new NotFoundException('Camera not found');
    return camera;
  }

  private toPublic(camera: Camera) {
    const { rtspUrlEncrypted: secret, ...safe } = camera;
    void secret;
    return safe;
  }
}
