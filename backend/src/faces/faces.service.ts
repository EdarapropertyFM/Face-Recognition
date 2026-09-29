import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Face } from './entities/face.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Detection } from '../detections/entities/detection.entity';
import { CreateFaceDto } from './dto/create-face.dto';
import { FROM_ENROLLMENT_SITE, inGallery } from './visibility';
import { familyWithout, planRemoval } from './removal';
import { UpdateFaceDto } from './dto/update-face.dto';
import { SecureStorageService } from '../secure-storage/secure-storage.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class FacesService {
  constructor(
    @InjectRepository(Face) private faceRepo: Repository<Face>,
    @InjectRepository(Enrollment) private enrollRepo: Repository<Enrollment>,
    @InjectRepository(Detection) private detRepo: Repository<Detection>,
    private readonly storage: SecureStorageService,
    private readonly aiGateway: AiGatewayService,
    private readonly realtime: RealtimeService,
    private readonly dataSource: DataSource,
  ) {}

  async create(createFaceDto: CreateFaceDto) {
    const face = this.faceRepo.create(createFaceDto);
    // Auto-generate ID if not provided
    if (!face.id) face.id = `F-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!face.enroll) face.enroll = new Date().toISOString().split('T')[0];
    
    return await this.faceRepo.save(face);
  }

  /**
   * Which people the AI gallery currently holds, used to show whether the
   * cameras can still recognise someone. Read-only on purpose.
   *
   * This used to create a face record for every person in the gallery, so
   * anyone added by a script or the AI webcam page appeared in the Face
   * Database as though they had registered. The Face Database now shows only
   * people who came through the enrolment site, so nothing is created here.
   */
  private async galleryIds(): Promise<Set<string> | null> {
    try {
      return new Set((await this.aiGateway.listPersons()).map((p) => p.person_id));
    } catch {
      return null;      // AI unreachable: 'inGallery' becomes null, not false
    }
  }

  /**
   * Every approved enrolment should have a face record for its owner and for
   * each household member (son, wife, driver...) enrolled in the AI gallery.
   * Approval creates them, but records lost since (the faces-from-enrollment
   * migration wiped the table) are never recreated, which left household
   * members missing. This restores them, stamped with the enrolment ref, so
   * the "registered on the site only" rule still holds. Idempotent: keyed on
   * the AI person id.
   */
  private async restoreEnrollmentFaces() {
    const approved = await this.enrollRepo.find({ where: { status: 'approved' } });
    if (!approved.length) return;
    const existing = await this.faceRepo.find({ select: { id: true, aiPersonId: true, enrollmentRef: true } });
    const byPerson = new Map(existing.filter((f) => f.aiPersonId).map((f) => [f.aiPersonId, f.id]));
    const unstamped = new Set(existing.filter((f) => !f.enrollmentRef).map((f) => f.id));
    const today = new Date().toISOString().slice(0, 10);
    const newId = () => `F-${Math.floor(100000 + Math.random() * 900000)}`;

    for (const e of approved) {
      const people: Array<{ aiPersonId: string; name: string; role: [string, string]; idno: string; img: string; owner: boolean }> = [];
      if (e.aiPersonId) {
        people.push({ aiPersonId: e.aiPersonId, name: String(e.owner?.name ?? 'Owner'),
          role: e.residentType === 'tenant' ? ['Tenant', 'مستأجر'] : ['Owner', 'مالك'],
          idno: String(e.owner?.nid ?? ''), img: String(e.owner?.faces?.front ?? ''), owner: true });
      }
      for (const m of e.family ?? []) {
        if (!m?.aiPersonId) continue;
        const relation = String(m.relation ?? 'Resident');
        people.push({ aiPersonId: m.aiPersonId, name: String(m.name ?? ''), role: [relation, relation],
          idno: String(m.nid ?? ''), img: String(m.faces?.front ?? ''), owner: false });
      }
      for (const p of people) {
        let faceId = byPerson.get(p.aiPersonId);
        if (!faceId) {
          faceId = newId();
          await this.faceRepo.save(this.faceRepo.create({
            id: faceId, name: [p.name, p.name], type: 'known', role: p.role, idno: p.idno, issuer: '',
            enroll: e.submittedAt?.slice(0, 10) || today, img: p.img, bldg: e.building, unit: e.unit,
            aiPersonId: p.aiPersonId, enrollmentRef: e.ref,
          }));
          byPerson.set(p.aiPersonId, faceId);
        }
        if (unstamped.delete(faceId)) await this.faceRepo.update({ id: faceId }, { enrollmentRef: e.ref });
        if (p.owner && e.faceId !== faceId) await this.enrollRepo.update({ ref: e.ref }, { faceId });
      }
    }
  }

  async findAll(type?: string) {
    await this.restoreEnrollmentFaces();
    const gallery = await this.galleryIds();
    const qb = this.faceRepo.createQueryBuilder('face')
      .where(FROM_ENROLLMENT_SITE);   // only people who registered on the site
    if (type) {
      qb.andWhere('face.type = :type', { type });
    }
    const faces = await qb.getMany();
    const counts = await this.detRepo.createQueryBuilder('d')
      .select('d.face', 'face').addSelect('COUNT(*)', 'n')
      .where('d.face IS NOT NULL').groupBy('d.face')
      .getRawMany<{ face: string; n: string }>();
    const byFace = new Map(counts.map((c) => [c.face, Number(c.n)]));
    return Promise.all(faces.map(async (face) => {
      const hydrated = await this.hydrate(face);
      // Thumbnail from the AI gallery when STMC holds no photo of its own.
      if (!hydrated.img && face.aiPersonId && gallery?.has(face.aiPersonId)) {
        hydrated.img = (await this.aiGateway.personPhotos(face.aiPersonId, 1))[0]?.[1] ?? '';
      }
      return {
        ...hydrated,
        detections: byFace.get(face.id) ?? 0,
        // false: the cameras can no longer recognise this person. null: AI unreachable.
        inGallery: inGallery(face, gallery),
      };
    }));
  }

  /**
   * One person with everything known about them: the face record, the
   * enrollment it came from (the owner's own, or the one listing them as
   * household) and their latest sightings.
   */
  async findOne(id: string) {
    const face = await this.findEntity(id);
    let enrollment = await this.enrollRepo.findOne({ where: { faceId: face.id } });
    let member: Record<string, unknown> | null = null;
    if (!enrollment && face.aiPersonId) {
      enrollment = await this.enrollRepo.findOne({ where: { aiPersonId: face.aiPersonId } })
        ?? await this.enrollRepo.createQueryBuilder('e')
          .where(`e.family @> :m::jsonb`, { m: JSON.stringify([{ aiPersonId: face.aiPersonId }]) })
          .getOne();
      member = (enrollment?.family ?? []).find((m) => m?.aiPersonId === face.aiPersonId) ?? null;
    }
    const [recent, total] = await this.detRepo.findAndCount({
      where: { face: face.id }, order: { when: 'DESC' }, take: 20,
    });
    const galleryPhotos = face.aiPersonId ? await this.aiGateway.personPhotos(face.aiPersonId) : [];
    return {
      ...(await this.hydrate(face)),
      galleryPhotos,
      detections: total,
      recentDetections: recent,
      member: member ? await this.hydrateMember(member) : null,
      enrollment: enrollment ? await this.hydrateEnrollment(enrollment) : null,
    };
  }

  private async hydrateMember(member: Record<string, unknown>) {
    const { nationalIdCard: _card, ...rest } = await this.storage.hydrateEnrollmentOwner(member);
    return rest;
  }

  private async hydrateEnrollment(e: Enrollment) {
    const faces = (e.owner?.faces ?? {}) as Record<string, string>;
    const resolved: Record<string, string> = {};
    for (const [k, v] of Object.entries(faces)) {
      const img = await this.storage.resolveImage(v).catch(() => null);
      if (img) resolved[k] = img;
    }
    const nationalIdCard = await this.storage.resolveImage(e.owner?.nationalIdCard).catch(() => null);
    const pages = e.owner?.rentalAgreement ? [e.owner.rentalAgreement].flat() : [];
    const rentalAgreement = (await Promise.all(pages.map((p: unknown) => this.storage.resolveImage(p).catch(() => null))))
      .filter(Boolean);
    return {
      ref: e.ref, status: e.status, residentType: e.residentType ?? 'owner', building: e.building, unit: e.unit, submittedAt: e.submittedAt,
      aiSyncStatus: e.aiSyncStatus, validationNote: e.validationNote,
      owner: { ...e.owner, faces: resolved, nationalIdCard, rentalAgreement },
      family: (e.family ?? []).map((m) => ({ name: m?.name, relation: m?.relation, nid: m?.nid, mobile: m?.mobile })),
      cars: e.cars ?? [],
    };
  }

  private async findEntity(id: string) {
    const face = await this.faceRepo.findOne({ where: { id } });
    if (!face) throw new NotFoundException('Face not found');
    return face;
  }

  async update(id: string, updateFaceDto: UpdateFaceDto) {
    const face = await this.findEntity(id);
    Object.assign(face, updateFaceDto);
    return await this.faceRepo.save(face);
  }

  /**
   * Remove a person from the system, everywhere.
   *
   * Deleting the row alone left them in the AI gallery, so every camera
   * carried on recognising somebody the software said had been deleted.
   *
   * The household follows the person who registered: they were only ever
   * here because that resident vouched for them. It does not work in
   * reverse -- deleting a son must not delete his father.
   */
  async remove(id: string) {
    const face = await this.findEntity(id);
    const enrollment = await this.enrollmentFor(face);
    const plan = planRemoval(face, enrollment);

    // The gallery first: if this fails, the records stay and the operator
    // can retry. Deleting the rows first would leave a person recognisable
    // with nothing left to point at them.
    for (const personId of plan.aiPersonIds) {
      await this.aiGateway.deletePerson(personId).catch(() => undefined);
    }

    const removedFaces = await this.dataSource.transaction(async (manager) => {
      const faces = manager.getRepository(Face);
      const enrollments = manager.getRepository(Enrollment);
      let count = 0;

      if (plan.aiPersonIds.length) {
        const byPerson = await faces.delete({ aiPersonId: In(plan.aiPersonIds) });
        count += byPerson.affected ?? 0;
      }
      // A face with no gallery person is not covered by the query above.
      const own = await faces.delete({ id: face.id });
      count += own.affected ?? 0;

      if (enrollment && plan.removesEnrollment) {
        await enrollments.delete({ ref: enrollment.ref });
      } else if (enrollment) {
        // Keep the registration, minus the person removed, so the household
        // list does not point at somebody who no longer exists.
        enrollment.family = familyWithout(enrollment, face.aiPersonId ?? null) as never;
        await enrollments.save(enrollment);
      }
      return count;
    });

    if (enrollment && plan.removesEnrollment) {
      await this.storage.deleteEnrollment(enrollment.ref).catch(() => undefined);
    }

    this.realtime.emit('face.deleted', {
      id: face.id,
      relationship: plan.relationship,
      removedFromAi: plan.aiPersonIds.length,
    });

    return {
      id: face.id,
      relationship: plan.relationship,
      removedFaces,
      removedFromAi: plan.aiPersonIds.length,
      removedEnrollment: plan.removesEnrollment ? enrollment?.ref ?? null : null,
    };
  }

  /** The registration this face belongs to, as applicant or as household. */
  private async enrollmentFor(face: Face): Promise<Enrollment | null> {
    const asApplicant = await this.enrollRepo.findOne({ where: { faceId: face.id } });
    if (asApplicant) return asApplicant;
    if (!face.aiPersonId) return null;
    const byPerson = await this.enrollRepo.findOne({ where: { aiPersonId: face.aiPersonId } });
    if (byPerson) return byPerson;
    return this.enrollRepo.createQueryBuilder('e')
      .where('e.family @> :member::jsonb', { member: JSON.stringify([{ aiPersonId: face.aiPersonId }]) })
      .getOne();
  }

  /**
   * What removing this person would take with them, without doing it.
   *
   * A confirmation that says "and 3 household members" is the difference
   * between an informed decision and a surprise.
   */
  async removalPreview(id: string) {
    const face = await this.findEntity(id);
    const enrollment = await this.enrollmentFor(face);
    const plan = planRemoval(face, enrollment);
    const household = plan.removesEnrollment && enrollment
      ? ((enrollment.family ?? []) as Array<{ name?: string; relation?: string }>)
        .map((member) => ({ name: member?.name ?? 'Unnamed', relation: member?.relation ?? null }))
      : [];
    return {
      id: face.id,
      name: face.name,
      relationship: plan.relationship,
      removesEnrollment: plan.removesEnrollment,
      enrollmentRef: plan.removesEnrollment ? enrollment?.ref ?? null : null,
      household,
    };
  }

  private async hydrate(face: Face) {
    const img = await this.storage.resolveImage(face.img).catch(() => face.img);
    return { ...face, img };
  }
}
