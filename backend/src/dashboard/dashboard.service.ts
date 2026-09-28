import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from '../cameras/entities/camera.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Face } from '../faces/entities/face.entity';
import { UnitsService } from '../units/units.service';
import { Enrollment } from '../enrollments/entities/enrollment.entity';

@Injectable()
export class DashboardService {
  constructor(@InjectRepository(Camera) private cameras: Repository<Camera>, @InjectRepository(Alert) private alerts: Repository<Alert>, @InjectRepository(Incident) private incidents: Repository<Incident>, @InjectRepository(Face) private faces: Repository<Face>, private units: UnitsService, @InjectRepository(Enrollment) private enrollments: Repository<Enrollment>) { }
  async summary() {
    const [totalCameras, onlineCameras, newAlerts, openIncidents, watchlist, alerts, incidents, buildingList] = await Promise.all([
      this.cameras.count(), this.cameras.count({ where: { status: 'online' } }), this.alerts.count({ where: { status: 'new' } }),
      this.incidents.createQueryBuilder('incident').where('incident.status != :status', { status: 'closed' }).getCount(), this.faces.count({ where: { type: 'watch' } }),
      this.alerts.find({ order: { when: 'DESC' }, take: 3 }), this.incidents.find({ order: { when: 'DESC' }, take: 4 }), this.buildingOverview(),
    ]);
    const faceIds = [...new Set(alerts.map(alert => alert.face))];
    const alertFaces = faceIds.length ? await this.faces.createQueryBuilder('face').where('face.id IN (:...faceIds)', { faceIds }).getMany() : [];
    return { metrics: { totalCameras, onlineCameras, newAlerts, openIncidents, watchlist }, alerts, incidents, faces: alertFaces, buildings: buildingList };
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
