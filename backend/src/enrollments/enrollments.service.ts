import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { enrollmentNote } from '../ai-gateway/enrollment-result';
import {
  PROVISIONAL_NAME, PROVISIONAL_ROLE, PURGE_INTERVAL_MS,
  abandonedCaptures, canReuseCapture, isDuplicateMatch,
} from './capture-lifecycle';
import { HouseholdMemberInput, householdProblems, normalizeMember } from './household-rules';

import { Face } from '../faces/entities/face.entity';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { cleanResidences } from '../units/residence';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { Enrollment } from './entities/enrollment.entity';
import { SecureStorageService } from '../secure-storage/secure-storage.service';
import { RealtimeService } from '../realtime/realtime.service';


type EnrollmentUpdate = UpdateEnrollmentDto & { status?: string; validationNote?: string };

@Injectable()
export class EnrollmentsService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @InjectRepository(Enrollment) private readonly enrollRepo: Repository<Enrollment>,
    @InjectRepository(Face) private readonly faceRepo: Repository<Face>,
    private readonly dataSource: DataSource,
    private readonly aiGateway: AiGatewayService,
    private readonly storage: SecureStorageService,
    private readonly realtime: RealtimeService,
  ) {}

  private purgeTimer?: NodeJS.Timeout;

  onModuleInit() {
    // A plain timer rather than @nestjs/schedule: one job does not justify a
    // dependency. unref() so it never holds the process open on shutdown.
    this.purgeTimer = setInterval(
      () => { void this.purgeAbandonedCaptures().catch(() => undefined); },
      PURGE_INTERVAL_MS,
    );
    this.purgeTimer.unref();
    void this.purgeAbandonedCaptures().catch(() => undefined);   // also sweep on boot
  }

  onModuleDestroy() {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  async create(createDto: CreateEnrollmentDto) {
    const identity = this.normalizedIdentity(createDto.owner as Record<string, unknown>);
    const ref = createDto.ref || `STMC-${Math.floor(100000 + Math.random() * 900000)}`;
    const storedOwner = await this.storage.storeEnrollmentOwner(ref, createDto.owner as Record<string, unknown>);
    // A resident may hold several units. The first is the primary one and is
    // mirrored into the flat building/unit columns the rest of the system
    // still reads, so the two can never disagree.
    const residences = cleanResidences(createDto.residences);
    const enrollment = this.enrollRepo.create({
      ...createDto,
      residences,
      building: residences[0]?.building || createDto.building,
      unit: residences[0]?.unit || createDto.unit,
      ref,
      owner: storedOwner,
      schema: createDto.schema || 'stmc.enroll.v1',
      submittedAt: createDto.submittedAt || new Date().toISOString(),
      // Drops a staff phone number and any under-16 National ID before storage;
      // the member's photos and ID card are encrypted to disk like the owner's.
      family: await Promise.all((createDto.family ?? []).map(async (member, i) => {
        const input = member as HouseholdMemberInput;
        const normalized = normalizeMember(input);
        const images = await this.storage.storeEnrollmentOwner(ref,
          { faces: input.faces ?? {}, nationalIdCard: normalized.nationalIdCard }, `member-${i}-`);
        return { ...normalized, faces: images.faces, nationalIdCard: images.nationalIdCard };
      })),
      cars: createDto.cars ?? [],
      status: 'pending',
      nationalIdNormalized: identity.nid || (null as unknown as string),
      mobileNormalized: identity.mobile || (null as unknown as string),
      // Claims the person provisioned at capture time, so the purge job leaves
      // it alone and approval reuses it instead of enrolling the face twice.
      aiPersonId: createDto.aiPersonId || (null as unknown as string),
      aiSyncStatus: createDto.aiPersonId ? 'captured' : 'not_started',
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

    // Every household member carries their own identity details and face
    // photos now, so they are validated here rather than stored unchecked.
    const members = (createDto.family ?? []) as HouseholdMemberInput[];
    const problems = householdProblems(members);
    if (problems.length) throw new ConflictException(problems.join(' | '));

    await this.rejectRecognizedFace(owner, createDto.aiPersonId);
    return this.create(createDto);
  }

  async checkFaceFrame(image: string, ignoreAiPersonId?: string) {
    if (!image.startsWith('data:image/')) throw new ConflictException('A camera frame is required');
    const result = await this.aiGateway.recognize(image) as {
      faces?: Array<Record<string, unknown> & { decision?: string; name?: string; similarity?: number }>;
    };
    const faces = result.faces ?? [];
    if (faces.length !== 1) {
      return { ok: false, reason: faces.length ? 'Keep only one face in the frame' : 'Move your face into the frame' };
    }
    const face = faces[0];
    // Stop a repeat registrant here rather than after four more steps. Only a
    // CONFIRMED match counts: 'tentative' is deliberately not enough to refuse
    // somebody a registration. A match against this draft's own capture is
    // the applicant recognising themselves, which is expected, not a duplicate.
    const matchedId = (face as { person_id?: string }).person_id;
    if (isDuplicateMatch(face.decision, matchedId, ignoreAiPersonId)
      && !(matchedId && await this.isAbandonedCapture(matchedId))) {
      return {
        ok: false,
        duplicate: true,
        reason: 'This face is already registered',
        matchedName: face.name ?? null,
        similarity: face.similarity ?? null,
      };
    }
    return { ok: true, quality: face.quality };
  }

  /**
   * Called when the five photos are captured, before the rest of the form is
   * filled in. Provisions the person in the AI gallery immediately so they are
   * recognizable straight away, and hands back the id for the draft to carry.
   *
   * The person is created with role 'provisional'. Until an enrollment claims
   * that id, `purgeAbandonedCaptures` deletes it, so an abandoned wizard does
   * not leave biometric data behind.
   */
  async captureFaces(images: string[], name?: string) {
    if (!Array.isArray(images) || images.length !== 5) {
      throw new ConflictException('All five face photos are required');
    }
    if (!images.every((image) => typeof image === 'string' && image.startsWith('data:image/'))) {
      throw new ConflictException('Face photos must be camera captures');
    }

    const existing = await this.aiGateway.identify(images[0]);
    // The applicant's own earlier, never-submitted capture (page refreshed,
    // draft lost): replace it instead of refusing them as a duplicate.
    if (existing?.personId && await this.isAbandonedCapture(existing.personId)) {
      await this.aiGateway.deletePerson(existing.personId);
    } else if (existing) {
      throw new ConflictException(
        `This face is already registered${existing.name ? ` as ${existing.name}` : ''}`,
      );
    }

    const provisioned = await this.aiGateway.provisionPerson(
      name?.trim() || PROVISIONAL_NAME, PROVISIONAL_ROLE, images,
    );
    return {
      aiPersonId: provisioned.personId,
      templates: provisioned.enrollment?.template_count ?? 0,
      pairwise_similarity: provisioned.enrollment?.pairwise_similarity ?? { min: null, mean: null },
      note: enrollmentNote(provisioned.enrollment),
    };
  }

  /**
   * Give back a capture the applicant decided to retake. Without this the
   * abandoned person sits in the gallery until the purge runs and the retake
   * is refused as a duplicate of the applicant's own earlier attempt.
   *
   * Only an unclaimed PROVISIONAL person can be released, so this public
   * endpoint cannot be used to delete enrolled residents.
   */
  async releaseCapture(aiPersonId: string) {
    const person = (await this.aiGateway.listPersons()).find((p) => p.person_id === aiPersonId);
    if (!person) return { released: false, reason: 'not found' };
    if (person.role !== PROVISIONAL_ROLE) {
      throw new ConflictException('Only an unsubmitted capture can be released');
    }
    const claimed = await this.enrollRepo.count({ where: { aiPersonId } })
      + await this.faceRepo.count({ where: { aiPersonId } });
    if (claimed) throw new ConflictException('This capture belongs to a submitted registration');

    await this.aiGateway.deletePerson(aiPersonId);
    return { released: true };
  }

  /**
   * Remove provisional AI persons whose wizard was abandoned: older than the
   * grace period and claimed by no enrollment and no face. Biometric data with
   * no owner record must not accumulate, so this runs hourly (see onModuleInit).
   */
  async purgeAbandonedCaptures() {
    let persons: Awaited<ReturnType<AiGatewayService['listPersons']>>;
    try {
      persons = await this.aiGateway.listPersons();
    } catch {
      return { checked: 0, deleted: 0 };          // AI down; try again next hour
    }
    const candidates = abandonedCaptures(persons, new Set());     // age filter only
    if (!candidates.length) return { checked: persons.length, deleted: 0 };

    const ids = candidates.map((p) => p.person_id);
    const claimedByEnrollment = await this.enrollRepo.createQueryBuilder('e')
      .select('e.aiPersonId', 'id').where('e.aiPersonId IN (:...ids)', { ids }).getRawMany();
    const claimedByFace = await this.faceRepo.createQueryBuilder('f')
      .select('f.aiPersonId', 'id').where('f.aiPersonId IN (:...ids)', { ids }).getRawMany();
    const claimed = new Set<string>([...claimedByEnrollment, ...claimedByFace].map((r) => r.id));

    let deleted = 0;
    for (const person of abandonedCaptures(candidates, claimed)) {
      const removed = await this.aiGateway.deletePerson(person.person_id).catch(() => null);
      if (removed) deleted += 1;
    }
    if (deleted) console.log(`Purged ${deleted} abandoned face capture(s) from the AI gallery.`);
    return { checked: persons.length, deleted };
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
    // Only a person WE create here may be rolled back on failure. One captured
    // earlier belongs to the enrollment, not to this approval attempt.
    let rollbackPersonId: string | null = null;

    try {
      let provisionedPersonId: string;
      let note: string;
      // Applied after the transaction commits: a failed rename must not roll
      // back an otherwise good approval.
      const memberRenames: Array<[string, string, string]> = [];

      if (enrollment.aiPersonId && await this.aiPersonUsable(enrollment.aiPersonId)) {
        // Already in the gallery from the capture step: reuse it rather than
        // enrolling the same face a second time under a new id.
        provisionedPersonId = enrollment.aiPersonId;
        // The capture was created anonymously as 'Pending registration' /
        // 'provisional'. Now that it has an owner, give it their name and
        // promote the role, or the gallery shows residents as pending forever.
        await this.aiGateway
          .updatePerson(provisionedPersonId, String(enrollment.owner?.name ?? 'Owner'), 'resident')
          .catch(() => undefined);      // cosmetic: never fail an approval for this
        note = 'AI enrollment reused the templates captured during registration';
      } else {
        const images = await this.faceImages(enrollment);
        const provisioned = await this.aiGateway.provisionPerson(
          String(enrollment.owner?.name ?? 'Owner'),
          'resident',
          images,
        );
        rollbackPersonId = provisioned.personId;
        provisionedPersonId = provisioned.personId;
        // The AI's own early-warning signal: photos of one person should score
        // ~0.6+ against each other. A low value means the captures disagree, so
        // record it instead of reporting a flat success.
        note = enrollmentNote(provisioned.enrollment);
      }

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
          // Marks this person as having come through the enrolment site,
          // which is what the Face Database lists.
          enrollmentRef: locked.ref,
        });
        const savedFace = await faces.save(face);

        // Each household member was enrolled in the gallery during capture.
        // Approval gives them a face record of their own, so a son or a
        // driver is recognised as themselves rather than as the unit owner.
        for (const member of (locked.family ?? []) as HouseholdMemberInput[]) {
          if (!member.aiPersonId) continue;
          await faces.save(faces.create({
            id: `F-${Math.floor(100000 + Math.random() * 900000)}`,
            name: [String(member.name ?? ''), String(member.name ?? '')],
            type: 'known',
            role: [String(member.relation ?? 'Resident'), String(member.relation ?? 'Resident')],
            idno: String(member.nid ?? ''),
            issuer: '',
            enroll: new Date().toISOString().slice(0, 10),
            img: String(member.faces?.front ?? ''),
            bldg: locked.building,
            unit: locked.unit,
            aiPersonId: member.aiPersonId,
            enrollmentRef: locked.ref,
          }));
          memberRenames.push([member.aiPersonId, String(member.name ?? ''), String(member.relation ?? 'resident')]);
        }

        locked.faceId = savedFace.id;
        locked.status = 'approved';
        locked.aiSyncStatus = 'synced';
        locked.validationNote = note;
        locked.aiPersonId = provisionedPersonId;
        locked.auditLog = [...(locked.auditLog ?? []), this.audit('approved', {
          faceId: savedFace.id,
          aiPersonId: provisionedPersonId,
          reusedCapture: rollbackPersonId === null,
        })];
        await enrollments.save(locked);
      });

      // Turn each member's anonymous capture into their named record too.
      for (const [personId, name, relation] of memberRenames) {
        await this.aiGateway.updatePerson(personId, name, relation.toLowerCase()).catch(() => undefined);
      }

      const approved = await this.findOne(ref);
      this.realtime.emit('enrollment.updated', { ref, status: 'approved', faceId: approved.faceId ?? null });
      return approved;
    } catch (error) {
      if (rollbackPersonId) await this.aiGateway.deletePerson(rollbackPersonId).catch(() => undefined);
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
    // The face went into the gallery at capture time, so rejecting the
    // registration has to take it back out or a refused applicant stays
    // recognizable at every camera.
    let removedFromAi = 0;
    for (const personId of this.aiPersonIdsOf(enrollment)) {
      await this.aiGateway.deletePerson(personId).catch(() => undefined);
      removedFromAi += 1;
    }
    enrollment.aiPersonId = null as unknown as string;
    enrollment.family = (enrollment.family ?? []).map((member) => ({ ...member, aiPersonId: null }));

    enrollment.status = 'rejected';
    enrollment.aiSyncStatus = 'not_started';
    enrollment.validationNote = reason || 'Rejected by administrator';
    enrollment.auditLog = [...(enrollment.auditLog ?? []),
      this.audit('rejected', { reason: enrollment.validationNote, removedFromAi })];
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

    // The household are separate gallery people and separate face records, so
    // deleting only the applicant would leave the rest recognisable forever.
    const personIds = this.aiPersonIdsOf(enrollment);
    try {
      for (const personId of personIds) await this.aiGateway.deletePerson(personId);
      await this.dataSource.transaction(async (manager) => {
        if (personIds.length) await manager.getRepository(Face).delete({ aiPersonId: In(personIds) });
        if (face) await manager.getRepository(Face).delete({ id: face.id });
        await manager.getRepository(Enrollment).delete({ ref });
      });
      await this.storage.deleteEnrollment(ref).catch(() => undefined);
      this.realtime.emit('enrollment.deleted', { ref, faceId: face?.id ?? null });
      return { ref, deletedFaceId: face?.id ?? null, removedFromAi: personIds.length };
    } catch (error) {
      enrollment.status = 'delete_failed';
      enrollment.validationNote = `Deletion failed: ${this.errorMessage(error)}`;
      enrollment.auditLog = [...(enrollment.auditLog ?? []), this.audit('deletion_failed', { error: this.errorMessage(error) })];
      await this.enrollRepo.save(enrollment).catch(() => undefined);
      throw error;
    }
  }

  /** Every AI gallery person this registration owns: the applicant and household. */
  private aiPersonIdsOf(enrollment: Enrollment): string[] {
    const ids = [enrollment.aiPersonId, ...((enrollment.family ?? []) as HouseholdMemberInput[])
      .map((member) => member.aiPersonId)];
    return [...new Set(ids.filter((id): id is string => Boolean(id)))];
  }

  /**
   * True if the id still exists in the AI gallery WITH templates. A capture
   * purged in the meantime, or one that somehow holds no templates, must fall
   * back to enrolling the stored photos rather than approving an empty person.
   */
  private async aiPersonUsable(personId: string) {
    try {
      return canReuseCapture((await this.aiGateway.listPersons())
        .find((p) => p.person_id === personId));
    } catch {
      return false;
    }
  }

  /**
   * Refuse a registration whose face is already in the gallery.
   *
   * `ownAiPersonId` is the person this draft enrolled during the capture step:
   * matching yourself is expected, not a duplicate, so it is excluded.
   */
  private async rejectRecognizedFace(owner: Record<string, unknown>, ownAiPersonId?: string) {
    const front = (owner.faces as Record<string, unknown> | undefined)?.front;
    if (typeof front !== 'string' || !front.startsWith('data:image/')) {
      throw new BadGatewayException('Face capture is required');
    }
    const match = await this.aiGateway.identify(front);
    if (match && match.personId !== ownAiPersonId && !(match.personId && await this.isAbandonedCapture(match.personId))) {
      throw new ConflictException(
        `This face is already registered${match.name ? ` as ${match.name}` : ''}`,
      );
    }
  }

  /**
   * A provisional capture that no enrolment or face has claimed: a wizard the
   * applicant abandoned (refresh, closed tab). Matching one is the same person
   * trying again, not a repeat registration.
   */
  private async isAbandonedCapture(aiPersonId: string) {
    const person = (await this.aiGateway.listPersons().catch(() => []))
      .find((p) => p.person_id === aiPersonId);
    if (!person || person.role !== PROVISIONAL_ROLE) return false;
    const claimed = await this.enrollRepo.count({ where: { aiPersonId } })
      + await this.faceRepo.count({ where: { aiPersonId } })
      + await this.enrollRepo.createQueryBuilder('e')
        .where('e.family @> :m::jsonb', { m: JSON.stringify([{ aiPersonId }]) }).getCount();
    return claimed === 0;
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
    return {
      ...enrollment,
      owner: await this.storage.hydrateEnrollmentOwner(enrollment.owner),
      family: await Promise.all((enrollment.family ?? []).map((m) => this.storage.hydrateEnrollmentOwner(m ?? {}))),
    };
  }
}
