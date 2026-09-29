import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { UnitRecordInput, UnitRegistryService } from './unit-registry.service';

@Controller('unit-registry')
export class UnitRegistryController {
  constructor(private readonly registry: UnitRegistryService) {}

  /** Projects -> buildings -> units with owner names. `?q=` searches all fields. */
  @Get()
  list(@Query('q') q?: string) {
    return this.registry.list(q ?? '');
  }

  /**
   * Replace the register with the real one:
   * [{ project, building, unit, ownerName, ownerPhone?, floor?, notes? }, ...]
   */
  @Post('import')
  @Roles('Admin')
  importAll(@Body() body: { units: UnitRecordInput[] }) {
    return this.registry.importAll(body?.units);
  }
}
