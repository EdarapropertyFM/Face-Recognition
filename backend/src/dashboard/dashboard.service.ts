import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Camera } from '../cameras/entities/camera.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Face } from '../faces/entities/face.entity';
import { UnitsService } from '../units/units.service';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Detection } from '../detections/entities/detection.entity';
import { isStrangerId } from '../detections/subject';

@Injectable()
export class DashboardService {
  constructor(@InjectRepository(Camera) private cameras: Repository<Camera>, @InjectRepository(Alert) private alerts: Repository<Alert>, @InjectRepository(Incident) private incidents: Repository<Incident>, @InjectRepository(Face) private faces: Repository<Face>, private units: UnitsService, @InjectRepository(Enrollment) private enrollments: Repository<Enrollment>, @InjectRepository(Detection) private detections: Repository<Detection>) { }
  async summary() {
    const [totalCameras, onlineCameras, newAlerts, openIncidents, watchlist, alerts, incidents, buildingList, today, pendingEnrollments, enrolledPeople] = await Promise.all([
      this.cameras.count(), this.cameras.count({ where: { status: 'online' } }), this.alerts.count({ where: { status: 'new' } }),
      this.incidents.createQueryBuilder('incident').where('incident.status != :status', { status: 'closed' }).getCount(), this.faces.count({ where: { type: 'watch' } }),
      this.alerts.find({ order: { when: 'DESC' }, take: 3 }), this.incidents.find({ order: { when: 'DESC' }, take: 4 }), this.buildingOverview(),
      this.seenToday(), this.enrollments.count({ where: { status: 'pending' } }),
      this.faces.count({ where: { enrollmentRef: Not(IsNull()) } }),
    ]);
    const faceIds = [...new Set(alerts.map(alert => alert.face))];
    const alertFaces = faceIds.length ? await this.faces.createQueryBuilder('face').where('face.id IN (:...faceIds)', { faceIds }).getMany() : [];
    return {
      metrics: {
        totalCameras, onlineCameras, newAlerts, openIncidents, watchlist,
        ...today, pendingEnrollments, enrolledPeople,
      },
      alerts, incidents, faces: alertFaces, buildings: buildingList,
    };
  }

  /**
   * Who the cameras have actually seen since midnight.
   *
   * Counted as distinct people, not as events: one resident walking past a
   * camera twenty times is one owner seen today, not twenty. The dashboard
   * used to show event counts from a hard-coded demo array, which is how it
   * reported 610 owners for a community with three enrolled faces.
   */
  private async seenToday() {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const rows = await this.detections.createQueryBuilder('d')
      .select('DISTINCT d.face', 'face')
      .where('d.face IS NOT NULL')
      .andWhere('d.when >= :from', { from: midnight.toISOString() })
      .getRawMany<{ face: string }>();

    const strangersToday = rows.filter((r) => isStrangerId(r.face)).length;
    const ownersToday = rows.length - strangersToday;
    const sightingsToday = await this.detections.createQueryBuilder('d')
      .where('d.when >= :from', { from: midnight.toISOString() }).getCount();
    // Share of people identified rather than left unknown. The single most
    // honest measure of whether recognition is actually working.
    const recognitionRate = rows.length
      ? Math.round((ownersToday / rows.length) * 100)
      : null;
    return { ownersToday, strangersToday, sightingsToday, recognitionRate };
  }

  /**
   * Buildings for the dashboard table, flattened out of the Units tree so the
   * counts are the live ones rather than a stored copy that drifts.
   */
  private async buildingOverview() {
    const { projects } = await this.units.tree();
    return projects.flatMap((project) => project.buildings.map((building) => ({
      project: project.project,
      code: building.code,
      name: building.name,
      units: building.totalUnits || building.occupiedUnits,
      enrolled: building.people,
      cams: building.cameras,
      strangersToday: building.strangersToday,
    })));
  }

  async badges() {
    const [alerts, enrollments, incidents, facedb] = await Promise.all([
      this.alerts.count({ where: { status: 'new' } }),
      this.enrollments.count({ where: { status: 'pending' } }),
      this.incidents.createQueryBuilder('incident').where('incident.status != :status', { status: 'closed' }).getCount(),
      this.faces.count()
    ]);
    return { alerts, enrollments, incidents, facedb };
  }
}
