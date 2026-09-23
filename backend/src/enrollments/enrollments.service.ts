import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { Face } from '../faces/entities/face.entity';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { Enrollment } from './entities/enrollment.entity';
import { SecureStorageService } from '../secure-storage/secure-storage.service';
import { RealtimeService } from '../realtime/realtime.service';

type EnrollmentUpdate = UpdateEnrollmentDto & { status?: string; validationNote?: string };

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(Enrollment) private readonly enrollRepo: Repository<Enrollment>,
    @InjectRepository(Face) private readonly faceRepo: Repository<Face>,
    private readonly dataSource: DataSource,
    private readonly aiGateway: AiGatewayService,
    private readonly storage: SecureStorageService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(createDto: CreateEnrollmentDto) {
    const identity = this.normalizedIdentity(createDto.owner as Record<string, unknown>);
    const ref = createDto.ref || `STMC-${Math.floor(100000 + Math.random() * 900000)}`;
    const storedOwner = await this.storage.storeEnrollmentOwner(ref, createDto.owner as Record<string, unknown>);
    const enrollment = this.enrollRepo.create({
      ...createDto,
      ref,
      owner: storedOwner,
      schema: createDto.schema || 'stmc.enroll.v1',
      submittedAt: createDto.submittedAt || new Date().toISOString(),
      family: createDto.family ?? [],
      cars: createDto.cars ?? [],
      status: 'pending',
      nationalIdNormalized: identity.nid || (null as unknown as string),
      mobileNormalized: identity.mobile || (null as unknown as string),
      aiSyncStatus: 'not_started',
      syncAttempts: 0,
      auditLog: [this.audit('submitted')],
    });

    try {
      const saved = await this.enrollRepo.save(enrollment);
      this.realtime.emit('enrollment.created', { ref: saved.ref, status: saved.status, building: saved.building });
      return saved;
    } catch (error) {
      await this.storage.deleteEnrollment(ref).catch(() => undefined);
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('A registration already exists for this National ID or mobile number');
      }
      throw error;
    }
  }

  async createSelfService(createDto: CreateEnrollmentDto) {
    const owner = createDto.owner as Record<string, unknown>;
    const { nid, mobile } = this.normalizedIdentity(owner);
    if (!nid || !mobile) throw new ConflictException('National ID and mobile number are required');

    const existing = await this.enrollRepo.createQueryBuilder('enrollment')
      .where('enrollment.nationalIdNormalized = :nid OR enrollment.mobileNormalized = :mobile', { nid, mobile })
      .orWhere("enrollment.owner ->> 'nid' = :nid OR enrollment.owner ->> 'mobile' = :mobile", { nid, mobile })
      .getOne();
    if (existing) throw new ConflictException('A registration already exists for this National ID or mobile number');

    await this.rejectRecognizedFace(owner);
    return this.create(createDto);
  }

  async checkFaceFrame(image: string) {
    if (!image.startsWith('data:image/')) throw new ConflictException('A camera frame is required');
    const result = await this.aiGateway.recognize(image) as { faces?: Array<Record<string, unknown>> };
    const faces = result.faces ?? [];
    if (faces.length !== 1) {
      return { ok: false, reason: faces.length ? 'Keep only one face in the frame' : 'Move your face into the frame' };
    }
    return { ok: true, quality: faces[0].quality };
  }

  async findAll() {
    const enrollments = await this.enrollRepo.find({ order: { submittedAt: 'DESC' } });
    return Promise.all(enrollments.map((enrollment) => this.hydrate(enrollment)));
  }

  async findOne(ref: string) {
    return this.hydrate(await this.findEntity(ref));
  }

  private async findEntity(ref: string) {
    const enrollment = await this.enrollRepo.findOne({ where: { ref } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    return enrollment;
  }

  async update(ref: string, updateDto: EnrollmentUpdate) {
    if (updateDto.status === 'approved') return this.approve(ref);
    if (updateDto.status === 'rejected') return this.reject(ref, updateDto.validationNote);

    const enrollment = await this.findEntity(ref);
    const { status: _status, ...safeUpdate } = updateDto;
    Object.assign(enrollment, safeUpdate);
    const saved = await this.enrollRepo.save(enrollment);
    this.realtime.emit('enrollment.updated', { ref: saved.ref, status: saved.status });
    return saved;
  }

  private async approve(ref: string) {
    const transition = await this.enrollRepo.createQueryBuilder()
      .update(Enrollment)
      .set({
        status: 'processing',
        aiSyncStatus: 'syncing',
        validationNote: null as unknown as string,
        syncAttempts: () => '"syncAttempts" + 1',
      })
      .where('ref = :ref', { ref })
      .andWhere('status IN (:...statuses)', { statuses: ['pending', 'failed'] })
      .execute();

    if (!transition.affected) {
      const current = await this.findEntity(ref);
      if (current.status === 'approved') return current;
      throw new ConflictException(`Enrollment cannot be approved while status is ${current.status}`);
    }

    const enrollment = await this.findEntity(ref);
    let aiPersonId: string | null = null;

    try {
      const images = await this.faceImages(enrollment);
      const provisioned = await this.aiGateway.provisionPerson(
        String(enrollment.owner?.name ?? 'Owner'),
        'resident',
        images,
      );
      aiPersonId = provisioned.personId;
      const provisionedPersonId = provisioned.personId;

      await this.dataSource.transaction(async (manager) => {
        const enrollments = manager.getRepository(Enrollment);
        const faces = manager.getRepository(Face);
        const locked = await enrollments.findOne({
          where: { ref },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked || locked.status !== 'processing') throw new ConflictException('Enrollment approval state changed');

        const face = faces.create({
          id: `F-${Math.floor(100000 + Math.random() * 900000)}`,
          name: [String(locked.owner?.name ?? 'Owner'), String(locked.owner?.name ?? 'Owner')],
          type: 'known',
          role: ['Owner', 'مالك'],
          idno: String(locked.owner?.nid ?? ''),
          issuer: '',
          enroll: new Date().toISOString().slice(0, 10),
          img: String(locked.owner?.faces?.front ?? ''),
          bldg: locked.building,
          unit: locked.unit,
          aiPersonId: provisionedPersonId,
        });
        const savedFace = await faces.save(face);
        locked.faceId = savedFace.id;
        locked.status = 'approved';
        locked.aiSyncStatus = 'synced';
        locked.validationNote = 'AI enrollment completed successfully';
        locked.auditLog = [...(locked.auditLog ?? []), this.audit('approved', { faceId: savedFace.id, aiPersonId: provisionedPersonId })];
        await enrollments.save(locked);
      });

      const approved = await this.findOne(ref);
      this.realtime.emit('enrollment.updated', { ref, status: 'approved', faceId: approved.faceId ?? null });
      return approved;
    } catch (error) {
      if (aiPersonId) await this.aiGateway.deletePerson(aiPersonId).catch(() => undefined);
      await this.markSyncFailure(ref, error);
      throw error instanceof BadGatewayException || error instanceof ConflictException
        ? error
        : new BadGatewayException(`Enrollment approval failed: ${this.errorMessage(error)}`);
    }
  }

  private async reject(ref: string, reason?: string) {
    const enrollment = await this.findEntity(ref);
    if (!['pending', 'failed'].includes(enrollment.status)) {
      throw new ConflictException(`Enrollment cannot be rejected while status is ${enrollment.status}`);
    }
    enrollment.status = 'rejected';
    enrollment.aiSyncStatus = 'not_started';
    enrollment.validationNote = reason || 'Rejected by administrator';
    enrollment.auditLog = [...(enrollment.auditLog ?? []), this.audit('rejected', { reason: enrollment.validationNote })];
    const saved = await this.enrollRepo.save(enrollment);
    this.realtime.emit('enrollment.updated', { ref: saved.ref, status: saved.status });
    return saved;
  }

  async remove(ref: string) {
    const enrollment = await this.findEntity(ref);
    if (enrollment.status === 'deleting') throw new ConflictException('Enrollment deletion is already in progress');

    enrollment.status = 'deleting';
    enrollment.auditLog = [...(enrollment.auditLog ?? []), this.audit('deletion_started')];
    await this.enrollRepo.save(enrollment);

    const face = enrollment.faceId
      ? await this.faceRepo.findOne({ where: { id: enrollment.faceId } })
      : null;

    try {
      if (face?.aiPersonId) await this.aiGateway.deletePerson(face.aiPersonId);
      await this.dataSource.transaction(async (manager) => {
        if (face) await manager.getRepository(Face).delete({ id: face.id });
        await manager.getRepository(Enrollment).delete({ ref });
      });
      await this.storage.deleteEnrollment(ref).catch(() => undefined);
      this.realtime.emit('enrollment.deleted', { ref, faceId: face?.id ?? null });
      return { ref, deletedFaceId: face?.id ?? null, removedFromAi: Boolean(face?.aiPersonId) };
    } catch (error) {
      enrollment.status = 'delete_failed';
      enrollment.validationNote = `Deletion failed: ${this.errorMessage(error)}`;
      enrollment.auditLog = [...(enrollment.auditLog ?? []), this.audit('deletion_failed', { error: this.errorMessage(error) })];
      await this.enrollRepo.save(enrollment).catch(() => undefined);
      throw error;
    }
  }

  private async rejectRecognizedFace(owner: Record<string, unknown>) {
    const front = (owner.faces as Record<string, unknown> | undefined)?.front;
    if (typeof front !== 'string' || !front.startsWith('data:image/')) {
      throw new BadGatewayException('Face capture is required');
    }
    const result = await this.aiGateway.recognize(front) as { faces?: Array<{ decision?: string }> };
    if (result.faces?.some((face) => face.decision === 'confirmed')) {
      throw new ConflictException('This face is already registered');
    }
  }

  private async faceImages(enrollment: Enrollment) {
    const faces = enrollment.owner?.faces as Record<string, unknown> | undefined;
    const keys = ['front', 'left', 'right', 'stepBack', 'betterLighting'];
    const images = (await Promise.all(keys.map((key) => this.storage.resolveImage(faces?.[key]))))
      .filter((value): value is string => Boolean(value));
    if (images.length !== 5) throw new BadGatewayException('Validation requires all five captured face photos');
    return images;
  }

  private async markSyncFailure(ref: string, error: unknown) {
    const enrollment = await this.enrollRepo.findOne({ where: { ref } });
    if (!enrollment) return;
    enrollment.status = 'failed';
    enrollment.aiSyncStatus = 'failed';
    enrollment.validationNote = this.errorMessage(error);
    enrollment.auditLog = [...(enrollment.auditLog ?? []), this.audit('ai_sync_failed', { error: enrollment.validationNote })];
    await this.enrollRepo.save(enrollment).catch(() => undefined);
  }

  private normalizedIdentity(owner: Record<string, unknown>) {
    return {
      nid: String(owner.nid ?? '').replace(/\D/g, ''),
      mobile: String(owner.mobile ?? '').replace(/\D/g, ''),
    };
  }

  private audit(action: string, details: Record<string, unknown> = {}) {
    return { action, at: new Date().toISOString(), ...details };
  }

  private isUniqueViolation(error: unknown) {
    return (error as { driverError?: { code?: string } })?.driverError?.code === '23505';
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private async hydrate(enrollment: Enrollment) {
    return { ...enrollment, owner: await this.storage.hydrateEnrollmentOwner(enrollment.owner) };
  }
}
