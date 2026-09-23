import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Face } from '../faces/entities/face.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Building } from '../buildings/entities/building.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { Setting } from '../settings/entities/setting.entity';
import { Detection } from '../detections/entities/detection.entity';
import { randomBytes, scryptSync } from 'crypto';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Face) private faceRepo: Repository<Face>,
    @InjectRepository(Alert) private alertRepo: Repository<Alert>,
    @InjectRepository(Incident) private incRepo: Repository<Incident>,
    @InjectRepository(Enrollment) private enrollRepo: Repository<Enrollment>,
    @InjectRepository(Building) private bldgRepo: Repository<Building>,
    @InjectRepository(Camera) private camRepo: Repository<Camera>,
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
    @InjectRepository(Detection) private detRepo: Repository<Detection>,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_DATA !== 'true') {
      console.log('Demo seed disabled in production.');
      return;
    }
    await this.seedUsers();
    await this.seedSettings();
    await this.seedBuildings();
    await this.seedCameras();
    await this.seedFaces();
    await this.seedAlerts();
    await this.seedIncidents();
    console.log('Seed completed.');
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
      threshold: 85,
      retStd: 30,
      retInc: 365,
      retLog: 90,
      alertOwners: true,
      alertStrangers: true,
      alertWatch: true
    });
  }

  private async seedBuildings() {
    const count = await this.bldgRepo.count();
    if (count > 0) return;

    await this.bldgRepo.save([
      { code: "WTR-B1", name: ["Building 1", "مبنى ١"], units: 24, cams: 8, enrolled: 18, strangersToday: 1 },
      { code: "WTR-B2", name: ["Building 2", "مبنى ٢"], units: 24, cams: 8, enrolled: 21, strangersToday: 0 },
      { code: "WTR-B3", name: ["Building 3", "مبنى ٣"], units: 18, cams: 6, enrolled: 12, strangersToday: 0 },
    ]);
  }

  private async seedFaces() {
    const count = await this.faceRepo.count();
    if (count > 0) return;

    await this.faceRepo.save([
      { id: "F-0001", name: ["Ahmed Kamal", "أحمد كمال"], type: "known", role: ["Owner WTR B1","مالك"], idno: "288", issuer: "Cairo", enroll: "2026-02-11", bldg: "WTR-B1", unit: "B1-0101" },
      { id: "F-0044", name: ["Khaled Nabil", "خالد نبيل"], type: "watch", role: ["BANNED","محظور"], idno: "301", issuer: "Cairo", enroll: "2026-08-30", ban: "SEF-01-02", bldg: "WTR-B2", unit: "—" },
    ]);
  }

  private async seedCameras() {
    if (await this.camRepo.count()) return;
    await this.camRepo.save([
      { id: 'CAM-Gate-03', displayName: 'Main Gate 03', zone: 3, status: 'offline', det: 2, last: new Date().toISOString() },
      { id: 'CAM-Plaza-11', displayName: 'Plaza 11', zone: 2, status: 'offline', det: 9, last: new Date().toISOString() },
      { id: 'CAM-Res-N-05', displayName: 'Residence North 05', zone: 0, status: 'offline', det: 0, last: '2026-09-16 07:12' },
    ]);
  }

  private async seedAlerts() {
    if (await this.alertRepo.count()) return;
    await this.alertRepo.save([
      { id: 'A1', face: 'F-0044', cam: 'CAM-Gate-03', zone: 3, when: '2026-09-16 09:41', conf: 96, status: 'new', log: [] },
      { id: 'A2', face: 'F-0001', cam: 'CAM-Plaza-11', zone: 2, when: '2026-09-16 09:12', conf: 91, status: 'new', log: [] },
    ]);
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
