import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Camera } from '../cameras/entities/camera.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Face } from '../faces/entities/face.entity';
import { Detection } from '../detections/entities/detection.entity';
import { BuildingSetting } from './entities/building-setting.entity';
import { Project } from './entities/project.entity';
import { CreateBuildingDto, CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { UpdateBuildingSettingDto } from './dto/update-building-setting.dto';
import { Residence, matches, residencesOf, unitCodesFor } from './residence';
import { ownerClaimedUnits, unitKey } from './unit-lock';
import { UnitRecord } from './entities/unit-record.entity';

export const UNASSIGNED = 'Unassigned';

export const SEARCH_SCOPES = ['all', 'projects', 'buildings', 'units'] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export interface UnitRow {
  unit: string;
  /** Registered owner from the property register; null when not recorded. */
  owner: string | null;
  people: number;
  enrollments: number;
  approved: number;
  pending: number;
  faces: number;
}

export interface BuildingRow {
  project: string;
  code: string;
  name: string[];
  totalUnits: number;
  occupiedUnits: number;
  coverage: number | null;      // null when nobody has said how many units exist
  cameras: number;
  camerasOnline: number;
  people: number;
  strangersToday: number;
  units: UnitRow[];
}

export interface ProjectRow {
  project: string;
  label?: string[];
  active?: boolean;
  buildings: BuildingRow[];
  totalUnits: number;
  occupiedUnits: number;
  cameras: number;
  people: number;
}

const SEP = '\u0000';

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Camera) private readonly cameras: Repository<Camera>,
    @InjectRepository(Enrollment) private readonly enrollments: Repository<Enrollment>,
    @InjectRepository(Face) private readonly faces: Repository<Face>,
    @InjectRepository(Detection) private readonly detections: Repository<Detection>,
    @InjectRepository(BuildingSetting) private readonly settings: Repository<BuildingSetting>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(UnitRecord) private readonly register: Repository<UnitRecord>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * The whole Project / Building / Unit tree, counted from live data:
   * cameras say which projects and buildings exist, enrolments say which units
   * are occupied and by how many people, and faces add what has been seen.
   */
  async tree(query = '', scope: SearchScope = 'all') {
    const [cameras, enrollments, faces, detections, settings, defined] = await Promise.all([
      this.cameras.find(),
      this.enrollments.find(),
      this.faces.find(),
      this.detections.find(),
      this.settings.find(),
      this.projects.find(),
    ]);

    // Buildings come from cameras. Remember each building project so a legacy
    // enrolment that names only a building still lands in the right one.
    const projectOfBuilding = new Map<string, string>();
    const buildings = new Map<string, BuildingRow>();

    const ensure = (project: string, code: string): BuildingRow => {
      const id = `${project}${SEP}${code}`;
      let row = buildings.get(id);
      if (!row) {
        row = {
          project, code, name: [code, code], totalUnits: 0, occupiedUnits: 0, coverage: null,
          cameras: 0, camerasOnline: 0, people: 0, strangersToday: 0, units: [],
        };
        buildings.set(id, row);
      }
      return row;
    };

    // Projects the admin created exist whether or not a camera has arrived,
    // so registration can be set up before the hardware is installed.
    const labels = new Map(defined.map((row) => [row.name, row.label]));
    const inactive = new Set(defined.filter((row) => !row.active).map((row) => row.name));
    const emptyProjects = new Set(defined.map((row) => row.name));

    for (const camera of cameras) {
      const project = camera.project?.trim() || UNASSIGNED;
      const code = camera.buildingCode?.trim() || UNASSIGNED;
      if (!projectOfBuilding.has(code)) projectOfBuilding.set(code, project);
      const row = ensure(project, code);
      row.cameras += 1;
      if (camera.status === 'online') row.camerasOnline += 1;
    }

    // Admin detail: display name and the real unit count behind the coverage bar.
    const ownersByBuilding = new Map<string, Record<string, string>>();
    for (const setting of settings) {
      const row = ensure(setting.project, setting.code);
      if (setting.name?.length) row.name = setting.name;
      row.totalUnits = setting.totalUnits ?? 0;
      ownersByBuilding.set(`${setting.project}${SEP}${setting.code}`, setting.unitOwners ?? {});

      // A registered unit is part of the building even before anybody has
      // enrolled from it: management knows who owns it, and an empty
      // building would otherwise look like an unconfigured one.
      for (const code of unitCodesFor(setting.code, setting.totalUnits ?? 0, setting.unitCodes ?? [])) {
        if (row.units.some((u) => u.unit === code)) continue;
        row.units.push({
          unit: code, owner: (setting.unitOwners ?? {})[code] ?? null,
          people: 0, enrollments: 0, approved: 0, pending: 0, faces: 0,
        });
      }
    }

    // Units and people come from enrolments.
    const perUnit = new Map<string, UnitRow>();
    const unitKey = (r: Residence) => `${r.project}${SEP}${r.building}${SEP}${r.unit}`;
    const resolveProject = (building: string) => projectOfBuilding.get(building) || UNASSIGNED;

    for (const enrollment of enrollments) {
      const householdSize = 1 + (Array.isArray(enrollment.family) ? enrollment.family.length : 0);
      for (const residence of residencesOf(enrollment as never, resolveProject)) {
        const row = ensure(residence.project, residence.building);
        const id = unitKey(residence);
        let unitRow = perUnit.get(id);
        if (!unitRow) {
          unitRow = {
            unit: residence.unit, owner: null,
            people: 0, enrollments: 0, approved: 0, pending: 0, faces: 0,
          };
          perUnit.set(id, unitRow);
          row.units.push(unitRow);
        }
        unitRow.enrollments += 1;
        unitRow.people += householdSize;
        if (enrollment.status === 'approved') unitRow.approved += 1;
        if (enrollment.status === 'pending') unitRow.pending += 1;
        row.people += householdSize;
      }
    }

    // Faces already in the gallery, counted against the unit they belong to.
    for (const face of faces) {
      const building = (face.bldg ?? '').trim();
      const unit = (face.unit ?? '').trim();
      if (!building || !unit) continue;
      if (face.type === 'unknown' || face.type === 'watch') continue;
      const unitRow = perUnit.get(`${resolveProject(building)}${SEP}${building}${SEP}${unit}`);
      if (unitRow) unitRow.faces += 1;
    }

    // Strangers today are counted from detections, not from the face rows: a
    // face record has no timestamp, so only a detection can say it was today.
    // The camera that saw them is what places them in a building.
    const buildingOfCamera = new Map(cameras.map((camera) => [
      camera.id,
      `${camera.project?.trim() || UNASSIGNED}${SEP}${camera.buildingCode?.trim() || UNASSIGNED}`,
    ]));
    const today = new Date().toISOString().slice(0, 10);
    for (const detection of detections) {
      if (!(detection.when ?? '').startsWith(today)) continue;
      if (detection.decision === 'match') continue;
      const row = buildings.get(buildingOfCamera.get(detection.cam) ?? '');
      if (row) row.strangersToday += 1;
    }

    for (const row of buildings.values()) {
      const owners = ownersByBuilding.get(`${row.project}${SEP}${row.code}`) ?? {};
      for (const unit of row.units) unit.owner = unit.owner ?? owners[unit.unit] ?? null;
      row.units.sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }));
      // Occupied means somebody has actually registered from it. Counting
      // every unit on the register would show 100% coverage on day one.
      row.occupiedUnits = row.units.filter((unit) => unit.enrollments > 0).length;
      row.coverage = row.totalUnits > 0
        ? Math.min(100, Math.round((row.occupiedUnits / row.totalUnits) * 100))
        : null;
    }

    // Search matches a project, a building or any unit inside it, and the
    // scope narrows which of those three count. A building matched only by
    // its units is shown with just those units, so the hit is visible without
    // drilling in.
    const filtered = [...buildings.values()].flatMap((row) => {
      if (!query.trim()) return [row];
      const byProject = scope === 'all' || scope === 'projects';
      const byBuilding = scope === 'all' || scope === 'buildings';
      const byUnit = scope === 'all' || scope === 'units';
      if (byProject && matches(query, row.project)) return [row];
      if (byBuilding && matches(query, row.code, ...row.name)) return [row];
      if (!byUnit) return [];
      const hits = row.units.filter((unit) => matches(query, unit.unit));
      return hits.length ? [{ ...row, units: hits, matchedUnits: hits.length }] : [];
    });

    const projects = new Map<string, ProjectRow>();
    // A project with no buildings yet is still a project; show it so the
    // admin can see what they created and add buildings to it.
    if (!query.trim()) {
      for (const name of emptyProjects) {
        projects.set(name, {
          project: name, buildings: [], totalUnits: 0, occupiedUnits: 0, cameras: 0, people: 0,
        });
      }
    }
    for (const row of filtered) {
      let project = projects.get(row.project);
      if (!project) {
        project = { project: row.project, buildings: [], totalUnits: 0, occupiedUnits: 0, cameras: 0, people: 0 };
        projects.set(row.project, project);
      }
      project.label = labels.get(row.project) ?? [row.project, row.project];
      project.active = !inactive.has(row.project);
      project.buildings.push(row);
      project.totalUnits += row.totalUnits;
      project.occupiedUnits += row.occupiedUnits;
      project.cameras += row.cameras;
      project.people += row.people;
    }

    const list = [...projects.values()].sort((a, b) => a.project.localeCompare(b.project));
    for (const project of list) {
      project.buildings.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }
    return {
      projects: list,
      totals: {
        projects: list.length,
        buildings: filtered.length,
        occupiedUnits: filtered.reduce((sum, row) => sum + row.occupiedUnits, 0),
        totalUnits: filtered.reduce((sum, row) => sum + row.totalUnits, 0),
        people: filtered.reduce((sum, row) => sum + row.people, 0),
        cameras: filtered.reduce((sum, row) => sum + row.cameras, 0),
        strangersToday: filtered.reduce((sum, row) => sum + row.strangersToday, 0),
      },
    };
  }

  async findBuilding(project: string, code: string) {
    const { projects } = await this.tree();
    const building = projects.find((row) => row.project === project)?.buildings
      .find((row) => row.code === code);
    if (!building) throw new NotFoundException('Building not found');
    return building;
  }

  /**
   * What the enrolment form offers. Residents pick a project, then a building,
   * then a unit, so none of the three can be mistyped.
   */
  /**
   * The dropdowns for the public enrolment form.
   *
   * Each unit carries whether an owner has already claimed it, so the form
   * can grey it out instead of letting a second person register as the owner
   * of a property that is already spoken for.
   */
  async enrollmentOptions() {
    const [{ projects }, settings, registered, claims] = await Promise.all([
      this.tree(), this.settings.find(), this.register.find({ select: { project: true, building: true, unit: true } }),
      this.ownerClaims(),
    ]);
    const held = ownerClaimedUnits(claims);
    const byKey = new Map(settings.map((row) => [`${row.project}${SEP}${row.code}`, row]));
    // Units from the unit register (Units page), in natural order: 4.6C-2 before 4.6C-10.
    const fromRegister = new Map<string, string[]>();
    for (const r of registered) {
      const key = `${r.project}${SEP}${r.building}`;
      fromRegister.set(key, [...(fromRegister.get(key) ?? []), r.unit]);
    }
    for (const list of fromRegister.values()) list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return projects
      .filter((project) => project.project !== UNASSIGNED && project.active !== false)
      .map((project) => ({
        project: project.project,
        buildings: project.buildings
          .filter((building) => building.code !== UNASSIGNED)
          .map((building) => {
            const setting = byKey.get(`${project.project}${SEP}${building.code}`);
            return {
              code: building.code,
              name: building.name,
              units: (fromRegister.get(`${project.project}${SEP}${building.code}`)
                ?? unitCodesFor(building.code, setting?.totalUnits ?? 0, setting?.unitCodes ?? []))
                // Only the flag, never the registered owner's name: this
                // endpoint is public, and anyone could otherwise read off who
                // lives in which unit by opening the registration form.
                .map((code) => ({
                  code,
                  ownerRegistered: held.has(unitKey(project.project, building.code, code)),
                })),
            };
          })
          .filter((building) => building.units.length),
      }))
      .filter((project) => project.buildings.length);
  }

  /** Every enrolment that could be holding a unit, for the lock rule. */
  private async ownerClaims() {
    const [rows, register] = await Promise.all([
      this.enrollments.find({
        select: { ref: true, status: true, residentType: true,
          building: true, unit: true, residences: true, owner: true } as never,
      }),
      this.register.find({ select: { project: true, building: true, unit: true } }),
    ]);
    // An enrolment row has no project column: only the residences list names
    // one. Older rows predate that list, so their project is recovered from
    // the unit register, which is the only place building+unit is unique.
    const projectOf = new Map(register.map((r) => [`${r.building}${SEP}${r.unit}`, r.project]));
    return rows.map((row) => ({
      ref: row.ref,
      status: row.status,
      residentType: row.residentType ?? 'owner',
      ownerName: String((row.owner as { name?: string } | undefined)?.name ?? ''),
      residences: row.residences?.length
        ? row.residences
        : [{
          project: projectOf.get(`${row.building}${SEP}${row.unit}`) ?? '',
          building: row.building,
          unit: row.unit,
        }],
    }));
  }

  /** Admin: set the real unit count, the unit codes and the display name. */
  async upsertSetting(project: string, code: string, dto: UpdateBuildingSettingDto) {
    const existing = await this.settings.findOne({ where: { project, code } });
    const row = existing
      ?? this.settings.create({
        project, code, name: [code, code], totalUnits: 0, unitCodes: [], unitOwners: {},
      });
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.totalUnits !== undefined) row.totalUnits = dto.totalUnits;
    if (dto.unitCodes !== undefined) row.unitCodes = dto.unitCodes;
    if (dto.unitOwners !== undefined) row.unitOwners = dto.unitOwners;
    return this.settings.save(row);
  }

  settingsList() {
    return this.settings.find({ order: { project: 'ASC', code: 'ASC' } });
  }

  // ---- Projects, managed from the admin panel ---------------------------

  /**
   * How many registrations would be orphaned by removing this project or
   * building.
   *
   * Both storage shapes have to be counted. Newer enrolments list every unit
   * in `residences`, but older ones carry only the flat `building`/`unit`
   * columns and name no project at all — checking `residences` alone reported
   * zero for them and let the project be deleted out from under live
   * registrations.
   */
  private async registrationsUsing(projectName: string, code?: string): Promise<number> {
    const match: Record<string, string> = { project: projectName };
    if (code) match.building = code;

    const codes = code
      ? [code]
      : (await this.settings.find({ where: { project: projectName }, select: { code: true } }))
        .map((row) => row.code);

    const [{ count }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM "enrollments"
       WHERE "residences" @> $1::jsonb
          OR (COALESCE(jsonb_array_length("residences"), 0) = 0
              AND cardinality($2::text[]) > 0
              AND "building" = ANY($2::text[]))`,
      [JSON.stringify([match]), codes],
    ) as Array<{ count: number }>;
    return count;
  }

  projectList() {
    return this.projects.find({ order: { name: 'ASC' } });
  }

  async createProject(dto: CreateProjectDto) {
    const name = dto.name.trim();
    if (await this.projects.exists({ where: { name } })) {
      throw new ConflictException('A project with this name already exists');
    }
    return this.projects.save(this.projects.create({
      name, label: dto.label?.length ? dto.label : [name, name], active: true,
    }));
  }

  /**
   * Renaming is a cascade, not a single update: the project name is what
   * cameras, building settings and enrolments all store, so changing it in
   * one place alone would orphan every one of them. All of it moves together
   * or none of it does.
   */
  async updateProject(name: string, dto: UpdateProjectDto) {
    const project = await this.projects.findOne({ where: { name } });
    if (!project) throw new NotFoundException('Project not found');
    const renamed = dto.name?.trim();

    if (renamed && renamed !== name) {
      if (await this.projects.exists({ where: { name: renamed } })) {
        throw new ConflictException('A project with this name already exists');
      }
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(Project).save({
          name: renamed,
          label: dto.label ?? (project.label?.[0] === name ? [renamed, renamed] : project.label),
          active: dto.active ?? project.active,
        });
        await manager.query(
          `UPDATE "building_settings" SET "project" = $1 WHERE "project" = $2`, [renamed, name]);
        await manager.query(
          `UPDATE "cameras" SET "project" = $1 WHERE "project" = $2`, [renamed, name]);
        // residences is a jsonb array of {project, building, unit}.
        await manager.query(`
          UPDATE "enrollments" SET "residences" = (
            SELECT jsonb_agg(
              CASE WHEN residence->>'project' = $2
                   THEN jsonb_set(residence, '{project}', to_jsonb($1::text))
                   ELSE residence END)
            FROM jsonb_array_elements("residences") AS residence)
          WHERE "residences" @> $3::jsonb`,
          [renamed, name, JSON.stringify([{ project: name }])]);
        await manager.getRepository(Project).delete({ name });
      });
      return this.projects.findOne({ where: { name: renamed } });
    }

    if (dto.label !== undefined) project.label = dto.label;
    if (dto.active !== undefined) project.active = dto.active;
    return this.projects.save(project);
  }

  /**
   * Deleting is refused while anything still points at the project, because
   * the alternative is silently detaching cameras and registrations from the
   * place they belong to. Deactivate instead to hide it from enrolment.
   */
  async removeProject(name: string) {
    const project = await this.projects.findOne({ where: { name } });
    if (!project) throw new NotFoundException('Project not found');

    const cameras = await this.cameras.count({ where: { project: name } });
    if (cameras) {
      throw new BadRequestException(
        `${cameras} camera(s) still belong to this project. Move or delete them first.`);
    }
    const registrations = await this.registrationsUsing(name);
    if (registrations) {
      throw new BadRequestException(
        `${registrations} registration(s) list a unit in this project. Deactivate it instead.`);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(BuildingSetting).delete({ project: name });
      await manager.getRepository(Project).delete({ name });
    });
    return { name, deleted: true };
  }

  // ---- Buildings within a project ---------------------------------------

  async addBuilding(projectName: string, dto: CreateBuildingDto) {
    if (!await this.projects.exists({ where: { name: projectName } })) {
      throw new NotFoundException('Project not found');
    }
    const code = dto.code.trim();
    if (await this.settings.exists({ where: { project: projectName, code } })) {
      throw new ConflictException('That building already exists in this project');
    }
    return this.settings.save(this.settings.create({
      project: projectName,
      code,
      name: dto.name?.length ? dto.name : [code, code],
      totalUnits: dto.totalUnits ?? 0,
      unitCodes: dto.unitCodes ?? [],
      unitOwners: dto.unitOwners ?? {},
    }));
  }

  async removeBuilding(projectName: string, code: string) {
    const setting = await this.settings.findOne({ where: { project: projectName, code } });
    if (!setting) throw new NotFoundException('Building not found');

    const cameras = await this.cameras.count({ where: { project: projectName, buildingCode: code } });
    if (cameras) {
      throw new BadRequestException(
        `${cameras} camera(s) are assigned to this building. Move or delete them first.`);
    }
    const registrations = await this.registrationsUsing(projectName, code);
    if (registrations) {
      throw new BadRequestException(`${registrations} registration(s) list a unit in this building.`);
    }

    await this.settings.delete({ project: projectName, code });
    return { project: projectName, code, deleted: true };
  }
}
