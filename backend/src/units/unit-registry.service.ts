import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BuildingSetting } from './entities/building-setting.entity';
import { Project } from './entities/project.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { unitCodesFor, unitKeyOf } from './residence';

type UnitRow = {
  id: string; project: string; building: string; unit: string;
  ownerName: string | null;
  registrations: Array<{ ref: string; status: string; residentType: string; name: string }>;
};

export type UnitRecordInput = {
  project: string; building: string; unit: string;
  ownerName?: string | null; ownerPhone?: string | null; floor?: string | null; notes?: string | null;
};

@Injectable()
export class UnitRegistryService {
  constructor(
    @InjectRepository(BuildingSetting) private readonly settings: Repository<BuildingSetting>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Enrollment) private readonly enrollments: Repository<Enrollment>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Projects -> buildings -> units with their owner, and whether someone from
   * that unit has registered through STMC (and as owner or tenant).
   */
  /**
   * Projects -> buildings -> units with their owner, and whether anyone from
   * that unit has registered through STMC.
   *
   * The admin panel is the only source. This used to merge a separate
   * `unit_registry` table seeded with placeholder buildings, so the page
   * showed units nobody had entered and disagreed with Admin about which
   * buildings existed. An import now writes into the same tables Admin
   * edits, rather than into a parallel one.
   */
  async list(query = '') {
    const [settings, defined, enrollments] = await Promise.all([
      this.settings.find({ order: { project: 'ASC', code: 'ASC' } }),
      this.projects.find(),
      this.enrollments.find({ select: { ref: true, building: true, unit: true, status: true, residentType: true, owner: true, residences: true } as never }),
    ]);

    // Every unit an enrolment covers, including extra residences.
    const registered = new Map<string, Array<{ ref: string; status: string; residentType: string; name: string }>>();
    for (const e of enrollments) {
      const units = [{ building: e.building, unit: e.unit },
        ...(((e as unknown as { residences?: Array<{ building: string; unit: string }> }).residences) ?? [])];
      for (const u of units) {
        const key = `${u.building}|${unitKeyOf(u.unit)}`;
        const list = registered.get(key) ?? [];
        if (!list.some((x) => x.ref === e.ref)) {
          list.push({ ref: e.ref, status: e.status, residentType: e.residentType ?? 'owner', name: String(e.owner?.name ?? '') });
        }
        registered.set(key, list);
      }
    }

    const needle = query.trim().toLowerCase();
    const hit = (...fields: Array<string | null | undefined>) =>
      !needle || fields.some((field) => (field ?? '').toLowerCase().includes(needle));

    const projects = new Map<string, Map<string, UnitRow[]>>();
    let units = 0, owned = 0, withStmc = 0;

    for (const setting of settings) {
      const ownerByKey = new Map(
        Object.entries(setting.unitOwners ?? {}).map(([unit, owner]) => [unitKeyOf(unit), owner]));
      const codes = unitCodesFor(setting.code, setting.totalUnits ?? 0, setting.unitCodes ?? []);
      const buildings = projects.get(setting.project) ?? new Map<string, UnitRow[]>();

      for (const unit of codes) {
        const ownerName = ownerByKey.get(unitKeyOf(unit)) ?? null;
        if (!hit(setting.project, setting.code, unit, ownerName)) continue;
        const stmc = registered.get(`${setting.code}|${unitKeyOf(unit)}`) ?? [];
        units += 1;
        if (ownerName) owned += 1;
        if (stmc.length) withStmc += 1;
        const list = buildings.get(setting.code) ?? [];
        list.push({
          id: `${setting.project}|${setting.code}|${unit}`,
          project: setting.project, building: setting.code, unit,
          ownerName, registrations: stmc,
        });
        buildings.set(setting.code, list);
      }
      // A building with no units yet still belongs on the page.
      if (!buildings.has(setting.code) && !needle) buildings.set(setting.code, []);
      if (buildings.size) projects.set(setting.project, buildings);
    }

    // A project with no buildings yet is still a project.
    if (!needle) {
      for (const project of defined) {
        if (!projects.has(project.name)) projects.set(project.name, new Map());
      }
    }

    return {
      demo: false,
      totals: {
        projects: projects.size,
        buildings: [...projects.values()].reduce((n, b) => n + b.size, 0),
        units, owned, vacant: units - owned, withStmc,
      },
      projects: [...projects].map(([project, buildings]) => ({
        project,
        buildings: [...buildings].map(([code, list]) => ({
          code,
          // Natural order: 4.6C-2 before 4.6C-10.
          units: list.sort((x, y) => x.unit.localeCompare(y.unit, undefined, { numeric: true })),
        })),
      })),
    };
  }

  /**
   * Bulk import of the real register, written into the same tables the admin
   * panel edits so the two can never drift apart again. Replaces the units
   * of every building it mentions; buildings it does not mention are left
   * alone.
   */
  async importAll(input: UnitRecordInput[]) {
    if (!Array.isArray(input) || !input.length) throw new BadRequestException('Send a non-empty list of units');

    const byBuilding = new Map<string, { project: string; building: string; units: string[]; owners: Record<string, string> }>();
    const seen = new Set<string>();
    input.forEach((row, i) => {
      const project = String(row.project ?? '').trim();
      const building = String(row.building ?? '').trim();
      const unit = String(row.unit ?? '').trim();
      if (!project || !building || !unit) throw new BadRequestException(`Row ${i + 1}: project, building and unit are required`);
      const key = `${project}|${building}|${unitKeyOf(unit)}`;
      if (seen.has(key)) throw new BadRequestException(`Row ${i + 1}: duplicate unit ${unit} in ${building}`);
      seen.add(key);
      const bucket = byBuilding.get(`${project}|${building}`) ?? { project, building, units: [], owners: {} };
      bucket.units.push(unit);
      const owner = typeof row.ownerName === 'string' ? row.ownerName.trim() : '';
      if (owner) bucket.owners[unit] = owner;
      byBuilding.set(`${project}|${building}`, bucket);
    });

    await this.dataSource.transaction(async (manager) => {
      const projects = manager.getRepository(Project);
      const settings = manager.getRepository(BuildingSetting);
      for (const entry of byBuilding.values()) {
        if (!await projects.exists({ where: { name: entry.project } })) {
          await projects.save(projects.create({
            name: entry.project, label: [entry.project, entry.project], active: true,
          }));
        }
        const row = await settings.findOne({ where: { project: entry.project, code: entry.building } })
          ?? settings.create({
            project: entry.project, code: entry.building,
            name: [entry.building, entry.building], totalUnits: 0, unitCodes: [], unitOwners: {},
          });
        row.unitCodes = entry.units;
        row.totalUnits = entry.units.length;
        row.unitOwners = entry.owners;
        await settings.save(row);
      }
    });

    return { imported: input.length, buildings: byBuilding.size };
  }
}
