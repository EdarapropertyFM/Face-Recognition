import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UnitRecord } from './entities/unit-record.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';

export type UnitRecordInput = {
  project: string; building: string; unit: string;
  ownerName?: string | null; ownerPhone?: string | null; floor?: string | null; notes?: string | null;
};

// Placeholder register used until the real one is imported. Every row is
// source='demo', and an import replaces all of them.
const DEMO_OWNERS = [
  'Ahmed Mostafa', 'Mona El-Sayed', 'Karim Abdelrahman', 'Sara Hassan', 'Omar Farouk',
  'Nour El-Din Adel', 'Heba Mahmoud', 'Youssef Ibrahim', 'Dina Samir', 'Tarek Zaki',
  'Laila Fathy', 'Mahmoud Gamal', 'Rania Khaled', 'Hany Saleh', 'Yasmin Ashraf', 'Amr Nabil',
];
const DEMO_LAYOUT: Array<[string, string, number]> = [
  ['West Town Residence', '4.5-C', 8],
  ['West Town Residence', '4.6-C', 8],
  ['West Town Residence', '4.7-C', 6],
  ['Edara Gardens', 'B1', 10],
  ['Edara Gardens', 'B2', 10],
];

function demoRows(): Partial<UnitRecord>[] {
  const rows: Partial<UnitRecord>[] = [];
  let n = 0;
  for (const [project, building, count] of DEMO_LAYOUT) {
    for (let i = 1; i <= count; i++) {
      const floor = Math.ceil(i / 2);
      const unit = `${building}-${floor}0${((i - 1) % 2) + 1}`;
      const vacant = (n + i) % 7 === 0;               // a few unsold / vacant units
      rows.push({
        project, building, unit, floor: String(floor), source: 'demo',
        ownerName: vacant ? null : DEMO_OWNERS[n % DEMO_OWNERS.length],
        ownerPhone: vacant ? null : `010${String(10000000 + n * 7919).slice(0, 8)}`,
      });
      n++;
    }
  }
  return rows;
}

@Injectable()
export class UnitRegistryService implements OnModuleInit {
  constructor(
    @InjectRepository(UnitRecord) private readonly records: Repository<UnitRecord>,
    @InjectRepository(Enrollment) private readonly enrollments: Repository<Enrollment>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_DATA !== 'true') return;
    if (await this.records.count()) return;
    await this.records.save(demoRows().map((row) => this.records.create(row)));
  }

  /**
   * Projects -> buildings -> units with their owner, and whether someone from
   * that unit has registered through STMC (and as owner or tenant).
   */
  async list(query = '') {
    const [rows, enrollments] = await Promise.all([
      this.records.find({ order: { project: 'ASC', building: 'ASC', unit: 'ASC' } }),
      this.enrollments.find({ select: { ref: true, building: true, unit: true, status: true, residentType: true, owner: true, residences: true } as never }),
    ]);

    // Every unit an enrolment covers, including extra residences.
    const registered = new Map<string, Array<{ ref: string; status: string; residentType: string; name: string }>>();
    for (const e of enrollments) {
      const units = [{ building: e.building, unit: e.unit },
        ...(((e as unknown as { residences?: Array<{ building: string; unit: string }> }).residences) ?? [])];
      for (const u of units) {
        const key = `${u.building}|${u.unit}`;
        const list = registered.get(key) ?? [];
        if (!list.some((x) => x.ref === e.ref)) {
          list.push({ ref: e.ref, status: e.status, residentType: e.residentType ?? 'owner', name: String(e.owner?.name ?? '') });
        }
        registered.set(key, list);
      }
    }

    const needle = query.trim().toLowerCase();
    const matches = (r: UnitRecord) => !needle || [r.project, r.building, r.unit, r.ownerName, r.ownerPhone]
      .some((f) => (f ?? '').toLowerCase().includes(needle));

    const projects = new Map<string, Map<string, unknown[]>>();
    let units = 0, owned = 0, withStmc = 0;
    for (const r of rows) {
      if (!matches(r)) continue;
      const stmc = registered.get(`${r.building}|${r.unit}`) ?? [];
      units++; if (r.ownerName) owned++; if (stmc.length) withStmc++;
      const buildings = projects.get(r.project) ?? new Map<string, unknown[]>();
      const list = buildings.get(r.building) ?? [];
      list.push({ ...r, registrations: stmc });
      buildings.set(r.building, list);
      projects.set(r.project, buildings);
    }

    return {
      demo: rows.some((r) => r.source === 'demo'),
      totals: {
        projects: projects.size,
        buildings: [...projects.values()].reduce((n, b) => n + b.size, 0),
        units, owned, vacant: units - owned, withStmc,
      },
      projects: [...projects].map(([project, buildings]) => ({
        project,
        buildings: [...buildings].map(([code, list]) => ({ code, units: list })),
      })),
    };
  }

  /** Replace the whole register with the real one (drops the demo rows). */
  async importAll(input: UnitRecordInput[]) {
    if (!Array.isArray(input) || !input.length) throw new BadRequestException('Send a non-empty list of units');
    const seen = new Set<string>();
    const rows = input.map((row, i) => {
      const project = String(row.project ?? '').trim();
      const building = String(row.building ?? '').trim();
      const unit = String(row.unit ?? '').trim();
      if (!project || !building || !unit) throw new BadRequestException(`Row ${i + 1}: project, building and unit are required`);
      const key = `${project}|${building}|${unit}`;
      if (seen.has(key)) throw new BadRequestException(`Row ${i + 1}: duplicate unit ${unit} in ${building}`);
      seen.add(key);
      const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      return {
        project, building, unit, source: 'import',
        ownerName: clean(row.ownerName), ownerPhone: clean(row.ownerPhone), floor: clean(row.floor), notes: clean(row.notes),
      };
    });
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(UnitRecord).clear();
      await manager.getRepository(UnitRecord).save(rows.map((r) => manager.getRepository(UnitRecord).create(r)));
    });
    return { imported: rows.length };
  }
}
