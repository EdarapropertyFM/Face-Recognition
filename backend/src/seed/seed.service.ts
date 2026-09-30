import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Face } from '../faces/entities/face.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { BuildingSetting } from '../units/entities/building-setting.entity';
import { Project } from '../units/entities/project.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { Setting } from '../settings/entities/setting.entity';
import { Detection } from '../detections/entities/detection.entity';
import { randomBytes, scryptSync } from 'crypto';

/**
 * The buildings that actually exist, with their real unit codes. Add a project
 * or building here only when it is real: everything else in the Units module
 * is counted from live cameras and enrolments.
 */
const REAL_PROJECTS = [
  { name: 'West Town Residence', label: ['West Town Residence', 'ويست تاون ريزيدنس'], active: true },
];

const REAL_BUILDINGS = [
  {
    project: 'West Town Residence',
    code: '4.6-C',
    name: ['4.6-C', '4.6-C'],
    totalUnits: 0,
    unitCodes: [] as string[],
  },
];

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Face) private faceRepo: Repository<Face>,
    @InjectRepository(Alert) private alertRepo: Repository<Alert>,
    @InjectRepository(Incident) private incRepo: Repository<Incident>,
    @InjectRepository(Enrollment) private enrollRepo: Repository<Enrollment>,
    @InjectRepository(BuildingSetting) private bldgRepo: Repository<BuildingSetting>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(Camera) private camRepo: Repository<Camera>,
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
    @InjectRepository(Detection) private detRepo: Repository<Detection>,
  ) {}

  async onModuleInit() {
    // The first administrator is not demo data: without an account nobody
    // can log in at all, so a production deployment would come up complete
    // and unusable. It is created from the environment, once, and only when
    // the table is empty -- it never touches an existing installation.
    await this.ensureFirstAdmin();
    await this.ensureSettingsRow();

    if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_DATA !== 'true') {
      console.log('Demo seed disabled in production.');
      return;
    }
    await this.seedUsers();
    await this.seedSettings();
    await this.seedBuildings();
    await this.seedCameras();
    await this.removeDemoFaces();
    await this.removeDemoAlerts();
    await this.seedIncidents();
    console.log('Seed completed.');
  }

  /**
   * Creates the one administrator a fresh deployment needs.
   *
   * The password comes from ADMIN_PASSWORD. There is deliberately no default:
   * a well-known fallback password on an access-control system is worse than
   * a server that refuses to start and tells you why.
   */
  private async ensureFirstAdmin() {
    if (await this.userRepo.count()) return;

    const username = (process.env.ADMIN_USERNAME || 'admin').trim();
    const password = process.env.ADMIN_PASSWORD || '';
    if (password.length < 12) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ADMIN_PASSWORD must be set to at least 12 characters: '
          + 'the database has no users and nobody would be able to log in.');
      }
      return;   // development falls through to the demo accounts below
    }

    await this.userRepo.save({
      u: username,
      name: ['Administrator', 'المسؤول'],
      role: 'Admin',
      status: 'active',
      passwordHash: this.passwordHash(password),
    });
    console.log(`Created the first administrator account: ${username}`);
  }

  /** A production database still needs its one settings row to exist. */
  private async ensureSettingsRow() {
    await this.seedSettings();
  }

  private async seedUsers() {
    const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || 'edara123';
    const count = await this.userRepo.count();
    if (count === 0) {
      await this.userRepo.save([
      { u: 'saud', name: ['Saud', 'سعود'], role: 'Admin', status: 'active', passwordHash: this.passwordHash(defaultPassword) },
      { u: 'omar', name: ['Omar', 'عمر'], role: 'Supervisor', status: 'active', passwordHash: this.passwordHash(defaultPassword) },
      { u: 'op1', name: ['Operator 1', 'مشغل ١'], role: 'Operator', status: 'active', passwordHash: this.passwordHash(defaultPassword) }
      ]);
      return;
    }
    // Upgrade demo accounts created before password authentication was added.
    for (const [u, role] of [['saud', 'Admin'], ['omar', 'Supervisor'], ['op1', 'Operator']] as const) {
      const user = await this.userRepo.createQueryBuilder('user').addSelect('user.passwordHash').where('user.u = :u', { u }).getOne();
      if (user && !user.passwordHash) await this.userRepo.update({ u }, { role, passwordHash: this.passwordHash(defaultPassword) });
    }
  }

  private passwordHash(password: string) {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  }

  private async seedSettings() {
    const count = await this.settingRepo.count();
    if (count > 0) return;

    await this.settingRepo.save({
      id: 'system',
      // Matches config.yaml. The old value of 85 was a percentage invented
      // for a slider and never corresponded to anything the AI used.
      threshold: 40,
      retStd: 90,
      retLog: 365,
      // Off by default: a recognised resident walking through their own
      // lobby is not an event worth waking anyone for.
      alertOwners: false,
      alertStrangers: true,
      purgeEnabled: true,
    });
  }

  /**
   * Real buildings only. The Units module discovers projects and buildings
   * from the cameras that are installed; this table adds what a camera cannot
   * report — the display name and the true unit count behind the coverage bar.
   * Earlier builds seeded three invented buildings with invented occupancy;
   * those are removed so nothing in the UI is made up.
   */
  private async seedBuildings() {
    // Projects are admin-owned records, so one must exist before its
    // buildings can hang off it.
    for (const project of REAL_PROJECTS) {
      if (!await this.projectRepo.exists({ where: { name: project.name } })) {
        await this.projectRepo.save(this.projectRepo.create(project));
      }
    }

    await this.bldgRepo.createQueryBuilder().delete()
      .where('code IN (:...codes)', { codes: ['WTR-B1', 'WTR-B2', 'WTR-B3'] }).execute();

    for (const building of REAL_BUILDINGS) {
      const exists = await this.bldgRepo.exists({
        where: { project: building.project, code: building.code },
      });
      if (!exists) await this.bldgRepo.save(this.bldgRepo.create(building));
    }
  }

  /**
   * The Face Database shows only people enrolled through STMC. Earlier builds
   * seeded two demo faces; remove them (never a real, AI-linked record).
   */
  private async removeDemoFaces() {
    await this.faceRepo.createQueryBuilder().delete()
      .where('id IN (:...ids) AND "aiPersonId" IS NULL', { ids: ['F-0001', 'F-0044'] })
      .execute();
  }

  private async seedCameras() {
    if (await this.camRepo.count()) return;
    await this.camRepo.save([
      { id: 'CAM-Gate-03', displayName: 'Main Gate 03', zone: 3, status: 'offline', det: 2, last: new Date().toISOString() },
      { id: 'CAM-Plaza-11', displayName: 'Plaza 11', zone: 2, status: 'offline', det: 9, last: new Date().toISOString() },
      { id: 'CAM-Res-N-05', displayName: 'Residence North 05', zone: 0, status: 'offline', det: 0, last: '2026-09-16 07:12' },
    ]);
  }

  /** Alerts come only from real camera detections; drop the two demo rows earlier builds seeded. */
  private async removeDemoAlerts() {
    await this.alertRepo.delete(['A1', 'A2']);
  }

  private async seedIncidents() {
    if (await this.incRepo.count()) return;
    await this.incRepo.save({
      id: 'INC-2041', sef: 'SEF-01-20', title: ['Trespass — restricted zone', 'تعدٍّ - منطقة محظورة'], face: 'F-0044', zone: 3,
      when: '2026-09-15 22:14', officer: ['Officer 12', 'ضابط ١٢'], status: 'open',
      desc: ['Subject entered a restricted zone after hours.', 'دخل الشخص منطقة محظورة بعد ساعات العمل.'], att: [],
    });
  }
}
