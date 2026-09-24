import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from './entities/camera.entity';
import { CreateCameraDto } from './dto/create-camera.dto';
import { ImportDvrDto } from './dto/import-dvr.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';
import { SecretCipherService } from '../security/secret-cipher.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { randomUUID } from 'crypto';
import { StreamTokenService } from '../security/stream-token.service';
import { RealtimeService } from '../realtime/realtime.service';
import { buildRtspUrl, credentialsFromUrl } from './rtsp-url';

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
    const source = this.resolveSource(dto);
    const camera = this.cameraRepo.create({
      id: dto.id.trim(), displayName: dto.displayName.trim(), zone: dto.zone,
      buildingCode: dto.buildingCode?.trim() || null, location: dto.location?.trim() || null,
      rtspUrlEncrypted: this.cipher.encrypt(source.url), rtspConfigured: true,
      ...source.details,
      playbackId: randomUUID(), codec: dto.codec || 'unknown', enabled: dto.enabled ?? true,
      status: 'offline', streamStatus: 'untested', det: 0, last: 'Never',
      lastHeartbeat: null, lastError: null,
    });
    const saved = await this.cameraRepo.save(camera);
    this.realtime.emit('camera.created', { id: saved.id, status: saved.status, configured: saved.rtspConfigured });
    return this.toPublic(saved);
  }

  /**
   * Create one camera per DVR channel. A recorder is a single device with N
   * feeds, so adding it channel by channel is both tedious and easy to get
   * half-done; this makes the whole recorder appear on the live wall at once.
   *
   * Channels that already exist are reported as skipped rather than failing
   * the whole import, so re-running after adding a channel is safe.
   */
  async importDvr(dto: ImportDvrDto) {
    const stream = (dto.stream as 'main' | 'sub') || 'sub';
    const prefix = dto.idPrefix.trim().toUpperCase().replace(/\s+/g, '-');
    const channels = Array.from({ length: dto.channels }, (_, i) => i + 1);

    const planned = channels.map((channel) => ({
      channel,
      id: `${prefix}-CH${channel}`,
      url: buildRtspUrl({
        host: dto.host.trim(), port: dto.port, username: dto.username.trim(),
        password: dto.password, brand: dto.brand, channel, stream,
        urlTemplate: dto.urlTemplate,
      }),
    }));

    const existing = new Set((await this.cameraRepo.find({
      select: { id: true }, where: planned.map((p) => ({ id: p.id })),
    })).map((c) => c.id));

    // Probing is sequential per channel in the AI, so fan out here; a 16-channel
    // recorder would otherwise take over a minute of wall clock.
    const reachable = dto.probe
      ? new Map(await Promise.all(planned.map(async (p) => {
        if (existing.has(p.id)) return [p.channel, false] as const;
        const result = await this.ai.probeCamera(p.url).catch(() => ({ ok: false, error: 'probe failed' }));
        return [p.channel, Boolean(result.ok)] as const;
      })))
      : null;

    const created: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const plan of planned) {
      if (existing.has(plan.id)) {
        skipped.push({ id: plan.id, reason: 'already exists' });
        continue;
      }
      if (reachable && !reachable.get(plan.channel)) {
        skipped.push({ id: plan.id, reason: 'channel did not respond' });
        continue;
      }
      const camera = this.cameraRepo.create({
        id: plan.id,
        displayName: `${(dto.displayName || prefix).trim()} CH${plan.channel}`,
        zone: dto.zone ?? 0,
        buildingCode: dto.buildingCode?.trim() || null,
        location: dto.location?.trim() || null,
        rtspUrlEncrypted: this.cipher.encrypt(plan.url), rtspConfigured: true,
        host: dto.host.trim(), port: dto.port ?? 554, username: dto.username.trim(),
        brand: dto.brand, channel: plan.channel, stream,
        playbackId: randomUUID(), codec: 'unknown', enabled: true,
        status: 'offline', streamStatus: 'untested', det: 0, last: 'Never',
        lastHeartbeat: null, lastError: null,
      });
      await this.cameraRepo.save(camera);
      created.push(plan.id);
    }

    if (created.length) this.realtime.emit('camera.created', { imported: created.length, host: dto.host });
    return { host: dto.host, channels: dto.channels, created, skipped, probed: Boolean(dto.probe) };
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
    const {
      rtspUrl, id: ignoredId,
      host, port, username, password, brand, channel, stream, urlTemplate,
      ...values
    } = updateCameraDto;
    void ignoredId;
    Object.assign(camera, values);

    // Rebuild the URL only when the operator actually supplied a new source.
    // Editing the name or zone must not require re-entering the password.
    const changingSource = Boolean(rtspUrl) || Boolean(password) || Boolean(host)
      || brand !== undefined || channel !== undefined || stream !== undefined;
    if (changingSource) {
      // Changing only the channel or stream must not force the operator to
      // retype the password, so recover it from the stored URL when they did
      // not supply a new one.
      const stored = camera.rtspUrlEncrypted
        ? credentialsFromUrl(this.cipher.decrypt(camera.rtspUrlEncrypted))
        : null;
      const merged = {
        ...updateCameraDto,
        host: host ?? camera.host ?? undefined,
        port: port ?? camera.port ?? undefined,
        username: username ?? camera.username ?? stored?.username ?? undefined,
        password: password ?? stored?.password ?? undefined,
        brand: brand ?? camera.brand ?? undefined,
        channel: channel ?? camera.channel ?? undefined,
        stream: stream ?? camera.stream ?? undefined,
        urlTemplate,
      } as CreateCameraDto;
      const source = this.resolveSource(merged);
      camera.rtspUrlEncrypted = this.cipher.encrypt(source.url);
      Object.assign(camera, source.details);
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

  /**
   * Turn what the operator submitted into one RTSP URL plus the non-secret
   * details worth remembering. Connection details win over a raw rtspUrl: the
   * structured form is what the UI sends, and it is the one we can re-open.
   */
  private resolveSource(dto: CreateCameraDto) {
    const hasDetails = Boolean(dto.host?.trim() && dto.username?.trim()
      && dto.password && dto.brand);
    if (hasDetails) {
      try {
        const url = buildRtspUrl({
          host: dto.host!.trim(), port: dto.port, username: dto.username!.trim(),
          password: dto.password!, brand: dto.brand!, channel: dto.channel,
          stream: (dto.stream as 'main' | 'sub') || 'sub', urlTemplate: dto.urlTemplate,
        });
        return {
          url,
          details: {
            host: dto.host!.trim(), port: dto.port ?? 554, username: dto.username!.trim(),
            brand: dto.brand!, channel: dto.channel ?? 1, stream: dto.stream || 'sub',
          },
        };
      } catch (error) {
        throw new ConflictException(error instanceof Error ? error.message : 'Invalid camera details');
      }
    }
    if (dto.rtspUrl?.trim()) {
      // A hand-written URL: nothing structured to remember, and the whole
      // string (credentials included) goes into the encrypted column.
      return {
        url: dto.rtspUrl.trim(),
        details: { host: null, port: null, username: null, brand: null, channel: null, stream: null },
      };
    }
    throw new ConflictException(
      'A camera needs either connection details (host, username, password, brand) '
      + 'or a full rtspUrl');
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
