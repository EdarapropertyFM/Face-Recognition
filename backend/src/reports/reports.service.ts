import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Detection } from '../detections/entities/detection.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { Face } from '../faces/entities/face.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { isStrangerId } from '../detections/subject';
import { AnalyticsRange, everyDay, rangeBetween, rangeOf } from './analytics-range';

/** `when` is an ISO-8601 string, so the date and hour are fixed substrings. */
const DAY = "LEFT(d.when, 10)";
const HOUR = "SUBSTRING(d.when FROM 12 FOR 2)";

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Detection) private detections: Repository<Detection>,
    @InjectRepository(Alert) private alerts: Repository<Alert>,
    @InjectRepository(Camera) private cameras: Repository<Camera>,
    @InjectRepository(Face) private faces: Repository<Face>,
    @InjectRepository(Enrollment) private enrollments: Repository<Enrollment>,
  ) {}

  /**
   * Everything the Reports page draws, in one query set.
   *
   * Counts are split two ways on purpose: sightings are events, and people
   * are distinct faces. One resident walking past a camera twenty times is
   * twenty sightings but one person, and reporting the first as the second
   * is how a three-resident community came to show hundreds of owners.
   */
  async analytics(
    days = 30,
    scope: { project?: string; building?: string; from?: string; to?: string } = {},
  ) {
    // An explicit from/to wins over the preset; otherwise it is the last
    // N days ending today.
    const range = rangeBetween(scope.from, scope.to) ?? rangeOf(days);
    // Scoping is resolved to a camera list first: detections and alerts
    // record which camera saw something, not which building it is in.
    const cameraIds = await this.camerasInScope(scope);
    if (cameraIds && !cameraIds.length) return this.emptyReport(range, scope);
    const [daily, hourly, byCamera, alerts, cameras, faces, enrollments, people] =
      await Promise.all([
        this.dailySeries(range, cameraIds),
        this.hourlySeries(range, cameraIds),
        this.cameraBreakdown(range, cameraIds),
        this.alertBreakdown(range, cameraIds),
        this.cameraHealth(scope),
        this.faceBreakdown(),
        this.enrollmentBreakdown(),
        this.peopleSeen(range, cameraIds),
      ]);

    const sightings = daily.reduce((sum, day) => sum + day.sightings, 0);
    return {
      range,
      scope,
      filters: await this.filterOptions(),
      totals: {
        sightings,
        people: people.total,
        residents: people.residents,
        strangers: people.strangers,
        // Share of distinct people the system actually put a name to.
        recognitionRate: people.total ? Math.round((people.residents / people.total) * 100) : null,
        busiestHour: hourly.reduce((best, h) => (h.sightings > best.sightings ? h : best), hourly[0]),
        alerts,
        cameras,
        faces,
        enrollments,
      },
      daily,
      hourly,
      byCamera,
      byBuilding: this.rollUpBuildings(byCamera),
    };
  }


  /** null = no scope, so every camera counts. [] = a scope that matches none. */
  private async camerasInScope(scope: { project?: string; building?: string }) {
    if (!scope.project && !scope.building) return null;
    const where: Record<string, string> = {};
    if (scope.project) where.project = scope.project;
    if (scope.building) where.buildingCode = scope.building;
    const rows = await this.cameras.find({ where, select: { id: true } as never });
    return rows.map((row) => row.id);
  }

  /** What the filter dropdowns offer, taken from the cameras that exist. */
  private async filterOptions() {
    const cameras = await this.cameras.find();
    return {
      projects: [...new Set(cameras.map((c) => c.project).filter(Boolean))].sort(),
      buildings: [...new Set(cameras.map((c) => c.buildingCode).filter(Boolean))].sort(),
    };
  }

  /** A scope with no cameras has no data; say so rather than querying for it. */
  private async emptyReport(range: AnalyticsRange, scope: { project?: string; building?: string }) {
    const [cameras, faces, enrollments] = await Promise.all([
      this.cameraHealth(scope), this.faceBreakdown(), this.enrollmentBreakdown(),
    ]);
    return {
      range,
      scope,
      filters: await this.filterOptions(),
      totals: {
        sightings: 0, people: 0, residents: 0, strangers: 0, recognitionRate: null,
        busiestHour: { hour: 0, sightings: 0 },
        alerts: { total: 0, perDay: 0, byCamera: [], byHour: Array.from({ length: 24 }, (_u, hour) => ({ hour, count: 0 })), byBuilding: [] },
        cameras, faces, enrollments,
      },
      daily: everyDay(range).map((date) => ({ date, sightings: 0, residents: 0, strangers: 0, alerts: 0 })),
      hourly: Array.from({ length: 24 }, (_u, hour) => ({ hour, sightings: 0 })),
      byCamera: [], byBuilding: [],
    };
  }

  /** Sightings and distinct people per calendar day, zero-filled. */
  private async dailySeries(range: AnalyticsRange, cams: string[] | null) {
    const rows = await this.detections.createQueryBuilder('d')
      .select(DAY, 'date')
      .addSelect('COUNT(*)', 'sightings')
      .addSelect("COUNT(DISTINCT d.face) FILTER (WHERE d.face NOT LIKE 'S-%')", 'residents')
      .addSelect("COUNT(DISTINCT d.face) FILTER (WHERE d.face LIKE 'S-%')", 'strangers')
      .where('d.when >= :from AND d.when <= :to', range)
      .andWhere(cams ? 'd.cam IN (:...cams)' : '1=1', { cams })
      .groupBy(DAY).orderBy(DAY, 'ASC')
      .getRawMany<{ date: string; sightings: string; residents: string; strangers: string }>();

    const alertRows = await this.alerts.createQueryBuilder('a')
      .select('LEFT(a.when, 10)', 'date').addSelect('COUNT(*)', 'alerts')
      .where('a.when >= :from AND a.when <= :to', range)
      .andWhere(cams ? 'a.cam IN (:...cams)' : '1=1', { cams })
      .groupBy('LEFT(a.when, 10)')
      .getRawMany<{ date: string; alerts: string }>();

    const byDate = new Map(rows.map((row) => [row.date, row]));
    const alertsByDate = new Map(alertRows.map((row) => [row.date, Number(row.alerts)]));
    return everyDay(range).map((date) => ({
      date,
      sightings: Number(byDate.get(date)?.sightings ?? 0),
      residents: Number(byDate.get(date)?.residents ?? 0),
      strangers: Number(byDate.get(date)?.strangers ?? 0),
      alerts: alertsByDate.get(date) ?? 0,
    }));
  }

  /** Sightings by hour of day, all 24 present so the shape is readable. */
  private async hourlySeries(range: AnalyticsRange, cams: string[] | null) {
    const rows = await this.detections.createQueryBuilder('d')
      .select(HOUR, 'hour').addSelect('COUNT(*)', 'sightings')
      .where('d.when >= :from AND d.when <= :to', range)
      .andWhere(cams ? 'd.cam IN (:...cams)' : '1=1', { cams })
      .groupBy(HOUR)
      .getRawMany<{ hour: string; sightings: string }>();
    const byHour = new Map(rows.map((row) => [Number(row.hour), Number(row.sightings)]));
    return Array.from({ length: 24 }, (_unused, hour) => ({
      hour, sightings: byHour.get(hour) ?? 0,
    }));
  }

  private async cameraBreakdown(range: AnalyticsRange, cams: string[] | null) {
    const rows = await this.detections.createQueryBuilder('d')
      .select('d.cam', 'cam')
      .addSelect('COUNT(*)', 'sightings')
      .addSelect("COUNT(*) FILTER (WHERE d.face LIKE 'S-%')", 'strangers')
      .where('d.when >= :from AND d.when <= :to', range)
      .andWhere(cams ? 'd.cam IN (:...cams)' : '1=1', { cams })
      .groupBy('d.cam')
      .getRawMany<{ cam: string; sightings: string; strangers: string }>();

    const cameras = await this.cameras.find();
    const byId = new Map(cameras.map((camera) => [camera.id, camera]));
    return rows.map((row) => {
      const camera = byId.get(row.cam);
      return {
        id: row.cam,
        name: camera?.displayName || row.cam,
        building: camera?.buildingCode ?? null,
        project: camera?.project ?? null,
        // A camera that has been deleted still owns its past sightings. Say
        // so, rather than printing its raw id where a name belongs.
        removed: !camera,
        sightings: Number(row.sightings),
        strangers: Number(row.strangers),
      };
    }).sort((a, b) => b.sightings - a.sightings);
  }

  private rollUpBuildings(byCamera: Array<{ building: string | null; sightings: number; strangers: number }>) {
    const buildings = new Map<string, { building: string; sightings: number; strangers: number }>();
    for (const camera of byCamera) {
      const key = camera.building || 'Unassigned';
      const entry = buildings.get(key) ?? { building: key, sightings: 0, strangers: 0 };
      entry.sightings += camera.sightings;
      entry.strangers += camera.strangers;
      buildings.set(key, entry);
    }
    return [...buildings.values()].sort((a, b) => b.sightings - a.sightings);
  }

  /** Distinct people, which is not the same number as sightings. */
  private async peopleSeen(range: AnalyticsRange, cams: string[] | null) {
    const rows = await this.detections.createQueryBuilder('d')
      .select('DISTINCT d.face', 'face')
      .where('d.face IS NOT NULL')
      .andWhere('d.when >= :from AND d.when <= :to', range)
      .andWhere(cams ? 'd.cam IN (:...cams)' : '1=1', { cams })
      .getRawMany<{ face: string }>();
    const strangers = rows.filter((row) => isStrangerId(row.face)).length;
    return { total: rows.length, strangers, residents: rows.length - strangers };
  }

  /**
   * Alerts carry no triage status any more -- each one just says somebody
   * was seen -- so counting them by state would say nothing. What is worth
   * knowing is where they come from and when, which is what gets acted on.
   */
  private async alertBreakdown(range: AnalyticsRange, cams: string[] | null) {
    const [byCamRows, byHourRows, total] = await Promise.all([
      this.alerts.createQueryBuilder('a')
        .select('a.cam', 'cam').addSelect('COUNT(*)', 'count')
        .where('a.when >= :from AND a.when <= :to', range)
        .andWhere(cams ? 'a.cam IN (:...cams)' : '1=1', { cams })
        .groupBy('a.cam').getRawMany<{ cam: string; count: string }>(),
      this.alerts.createQueryBuilder('a')
        .select('SUBSTRING(a.when FROM 12 FOR 2)', 'hour').addSelect('COUNT(*)', 'count')
        .where('a.when >= :from AND a.when <= :to', range)
        .andWhere(cams ? 'a.cam IN (:...cams)' : '1=1', { cams })
        .groupBy('SUBSTRING(a.when FROM 12 FOR 2)').getRawMany<{ hour: string; count: string }>(),
      this.alerts.createQueryBuilder('a')
        .where('a.when >= :from AND a.when <= :to', range)
        .andWhere(cams ? 'a.cam IN (:...cams)' : '1=1', { cams }).getCount(),
    ]);

    const cameras = await this.cameras.find();
    const byId = new Map(cameras.map((camera) => [camera.id, camera]));
    const byCamera = byCamRows.map((row) => {
      const camera = byId.get(row.cam);
      return {
        id: row.cam,
        name: camera?.displayName || row.cam,
        building: camera?.buildingCode ?? null,
        removed: !camera,
        count: Number(row.count),
      };
    }).sort((a, b) => b.count - a.count);

    const byHourMap = new Map(byHourRows.map((row) => [Number(row.hour), Number(row.count)]));
    const byHour = Array.from({ length: 24 }, (_unused, hour) => ({ hour, count: byHourMap.get(hour) ?? 0 }));

    const buildings = new Map<string, number>();
    for (const camera of byCamera) {
      const key = camera.building || 'Unassigned';
      buildings.set(key, (buildings.get(key) ?? 0) + camera.count);
    }

    return {
      total,
      perDay: range.days ? Math.round((total / range.days) * 10) / 10 : 0,
      byCamera,
      byHour,
      byBuilding: [...buildings.entries()]
        .map(([building, count]) => ({ building, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  private async cameraHealth(scope: { project?: string; building?: string } = {}) {
    const where: Record<string, string> = {};
    if (scope.project) where.project = scope.project;
    if (scope.building) where.buildingCode = scope.building;
    const [total, online] = await Promise.all([
      this.cameras.count({ where }), this.cameras.count({ where: { ...where, status: 'online' } }),
    ]);
    return { total, online, offline: total - online };
  }

  private async faceBreakdown() {
    const rows = await this.faces.createQueryBuilder('f')
      .select('f.type', 'type').addSelect('COUNT(*)', 'count').groupBy('f.type')
      .getRawMany<{ type: string; count: string }>();
    return {
      total: rows.reduce((sum, row) => sum + Number(row.count), 0),
      byType: Object.fromEntries(rows.map((row) => [row.type, Number(row.count)])),
    };
  }

  private async enrollmentBreakdown() {
    const rows = await this.enrollments.createQueryBuilder('e')
      .select('e.status', 'status').addSelect('COUNT(*)', 'count').groupBy('e.status')
      .getRawMany<{ status: string; count: string }>();
    const byStatus = Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
    return {
      total: rows.reduce((sum, row) => sum + Number(row.count), 0),
      byStatus,
      pending: Number(byStatus.pending ?? 0),
    };
  }
}
