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
import { StreamTokenService } from '../security/stream-token.service';
import { Camera } from '../cameras/entities/camera.entity';
import { describeCamera, describeSubject, isStrangerId, strangerId } from './subject';

@Injectable()
export class DetectionsService {
  constructor(@InjectRepository(Detection) private detections: Repository<Detection>, @InjectRepository(Alert) private alerts: Repository<Alert>, @InjectRepository(Setting) private settings: Repository<Setting>, @InjectRepository(Face) private faces: Repository<Face>, @InjectRepository(Camera) private cameras: Repository<Camera>, private readonly realtime: RealtimeService, private readonly tokens: StreamTokenService) {}

  async create(dto: CreateDetectionDto) {
    const matchedFace = dto.aiPersonId ? await this.faces.findOne({ where: { aiPersonId: dto.aiPersonId } }) : null;
    const { aiPersonId, strangerKey, ...input } = dto;
    const when = input.when ?? new Date().toISOString();
    const face = matchedFace?.id ?? input.face
      ?? strangerId(input.cam, (input.quality as { trackId?: unknown } | undefined)?.trackId,
                    when, strangerKey);
    const detection = await this.detections.save(this.detections.create({ ...input, face: face ?? undefined, type: matchedFace?.type ?? input.type, when, decision: input.decision ?? 'unknown' }));
    const alert = await this.maybeCreateAlert(detection);
    this.realtime.emit('detection.created', { id: detection.id, cam: detection.cam, zone: detection.zone, type: detection.type, decision: detection.decision });
    if (alert) this.realtime.emit('alert.created', { id: alert.id, cam: alert.cam, zone: alert.zone, status: alert.status, type: detection.type });
    return { detection, alertCreated: Boolean(alert), alert };
  }

  findAll() {
    return this.detections.find({ order: { when: 'DESC' }, take: 100 });
  }

  /**
   * A short-lived signed link to a sighting image.
   *
   * These are fetched by <img src="...">, which cannot send an Authorization
   * header, so the permission has to travel in the URL. Signed and expiring
   * rather than public, because they are face images: a plain path would let
   * anyone who guessed one read biometric data.
   */
  snapshotToken(rel: string): string {
    return this.tokens.issue(rel, 3600);
  }

  /** Fetch a saved sighting image from the AI service. */
  async snapshot(rel: string, token: string): Promise<Buffer> {
    if (!rel || rel.includes('..')) throw new NotFoundException('No such snapshot');
    this.tokens.verify(token, rel);
    const base = (process.env.AI_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    const url = `${base}/snapshots/${rel.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
      .catch(() => null);
    if (!response?.ok) throw new NotFoundException('No such snapshot');
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Everyone Track & Trace can follow: enrolled faces plus strangers seen by
   * the cameras, each with a sighting count and last-seen time.
   */
  async subjects() {
    const [faces, seen] = await Promise.all([
      this.faces.find(),
      this.detections.createQueryBuilder('d')
        .select('d.face', 'face').addSelect('COUNT(*)', 'n').addSelect('MAX(d.when)', 'last')
        .where('d.face IS NOT NULL').groupBy('d.face').getRawMany<{ face: string; n: string; last: string }>(),
    ]);
    const stats = new Map(seen.map((s) => [s.face, { count: Number(s.n), last: s.last }]));
    const faceIds = new Set(faces.map((f) => f.id));
    const known = faces.map((f) => ({ ...describeSubject(f.id, f), count: stats.get(f.id)?.count ?? 0, last: stats.get(f.id)?.last ?? null }));
    const strangers = seen.filter((s) => isStrangerId(s.face) && !faceIds.has(s.face))
      .map((s) => ({ ...describeSubject(s.face), count: Number(s.n), last: s.last }));
    return [...known, ...strangers].sort((a, b) => String(b.last ?? '').localeCompare(String(a.last ?? '')));
  }

  /** Full sighting history of one face or stranger, newest first, with camera and building. */
  async history(faceId: string) {
    const [face, rows, cameras] = await Promise.all([
      this.faces.findOne({ where: { id: faceId } }),
      this.detections.find({ where: { face: faceId }, order: { when: 'DESC' }, take: 2000 }),
      this.cameras.find(),
    ]);
    if (!face && !rows.length) throw new NotFoundException('No face or sightings with this id');
    const camById = new Map(cameras.map((c) => [c.id, c]));
    return {
      subject: describeSubject(faceId, face),
      total: rows.length,
      // The signed link travels with the row, so the browser needs no extra
      // request per thumbnail to be allowed to load it.
      detections: rows.map((d) => ({
        ...d,
        camera: describeCamera(d.cam, camById.get(d.cam)),
        snapshotToken: d.snapshot ? this.snapshotToken(d.snapshot) : null,
      })),
    };
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
    if (!setting) return null;
    // Movement with no recognisable face: always alert (someone is there).
    if (detection.type === 'motion') return this.alertOnce(detection, 'motion');
    const watch = detection.type === 'watch';
    const unknown = !watch && (detection.type === 'unknown' || detection.decision === 'unknown');
    // conf is cosine similarity x 100, and the AI already decided whether it
    // is a match (CONFIRMED at >= 0.40 in config.yaml), so a percentage
    // threshold like 85 would block every real match. Trust the AI decision:
    // a named alert needs 'confirmed'; 'tentative' is too unsure to name anyone.
    const confirmed = detection.decision === 'confirmed' || detection.conf >= setting.threshold;
    if (watch && (!setting.alertWatch || !confirmed)) return null;
    if (unknown && !setting.alertStrangers) return null;
    if (!watch && !unknown && (!setting.alertOwners || !confirmed)) return null;
    return this.alertOnce(detection, detection.face ?? 'unknown');
  }

  /** One alert per person (or per 'motion') per camera within 2 minutes. */
  private async alertOnce(detection: Detection, face: string) {
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const duplicate = await this.alerts.createQueryBuilder('alert').where('alert.cam = :cam AND alert.face = :face AND alert.status IN (:...statuses) AND alert.when >= :since', { cam: detection.cam, face, statuses: ['new', 'ack', 'actioned'], since }).getOne();
    if (duplicate) return duplicate;
    return this.alerts.save(this.alerts.create({ id: `A-${Date.now()}`, face, cam: detection.cam, zone: detection.zone, when: detection.when, conf: detection.conf, status: 'new', log: [['ai', 'CREATED', new Date().toISOString()]] }));
  }
}
