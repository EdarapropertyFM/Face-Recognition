import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolePermission } from './entities/role-permission.entity';
import { LOCKED_ROLE, MODULES, ROLE_DEFAULTS, normalizePermissions } from './role-defaults';

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    @InjectRepository(RolePermission) private readonly roles: Repository<RolePermission>,
  ) {}

  /** Seeds the built-in roles once, then leaves the stored rows alone. */
  async onModuleInit() {
    const existing = new Set((await this.roles.find()).map((row) => row.role));
    const missing = Object.entries(ROLE_DEFAULTS)
      .filter(([role]) => !existing.has(role))
      .map(([role, permissions]) => this.roles.create({ ...permissions, role, builtIn: true }));
    if (missing.length) await this.roles.save(missing);
  }

  /**
   * Admin's row is resolved to every module on read rather than trusting
   * what was seeded. Adding a module to MODULES used to leave it missing
   * from the already-seeded Admin row, which silently removed the screen
   * from the navigation for everyone.
   */
  private resolve(row: RolePermission): RolePermission {
    if (row.role !== LOCKED_ROLE) return row;
    return { ...row, view: [...MODULES], edit: [...MODULES] };
  }

  async list() {
    const rows = (await this.roles.find({ order: { role: 'ASC' } })).map((row) => this.resolve(row));
    // Keep the defaults' order: Admin first, then descending authority.
    const order = Object.keys(ROLE_DEFAULTS);
    return {
      modules: MODULES,
      locked: LOCKED_ROLE,
      roles: rows.sort((a, b) => {
        const ia = order.indexOf(a.role); const ib = order.indexOf(b.role);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.role.localeCompare(b.role);
      }),
    };
  }

  /** The permission map the browser and the guards both read. */
  async map(): Promise<Record<string, { view: string[]; edit: string[] }>> {
    const rows = (await this.roles.find()).map((row) => this.resolve(row));
    return Object.fromEntries(rows.map((row) => [row.role, { view: row.view ?? [], edit: row.edit ?? [] }]));
  }

  async update(role: string, dto: { view?: string[]; edit?: string[] }) {
    if (role === LOCKED_ROLE) {
      throw new ConflictException(
        'Admin keeps every module: removing one would lock this screen away with no way back.');
    }
    const row = await this.roles.findOne({ where: { role } });
    if (!row) throw new NotFoundException(`No such role: ${role}`);

    const next = normalizePermissions(dto.view ?? row.view, dto.edit ?? row.edit);
    row.view = next.view;
    row.edit = next.edit;
    return this.roles.save(row);
  }

  /** Restores one role to the shipped defaults. */
  async reset(role: string) {
    const defaults = ROLE_DEFAULTS[role];
    if (!defaults) throw new NotFoundException(`No default for role: ${role}`);
    const row = await this.roles.findOne({ where: { role } });
    if (!row) throw new NotFoundException(`No such role: ${role}`);
    row.view = defaults.view;
    row.edit = defaults.edit;
    return this.roles.save(row);
  }
}
