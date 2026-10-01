import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { SEARCH_SCOPES, SearchScope, UnitsService } from './units.service';
import { UpdateBuildingSettingDto } from './dto/update-building-setting.dto';
import {
  AddUnitsDto, BulkBuildingsDto, CreateBuildingDto, CreateProjectDto,
  SetUnitOwnerDto, UpdateProjectDto,
} from './dto/project.dto';
import { Public, Roles } from '../auth/auth.decorators';

@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  /**
   * The Project / Building / Unit tree. `?q=` searches all three levels;
   * `?scope=` narrows it to projects, buildings or units.
   */
  @Get()
  tree(@Query('q') q?: string, @Query('scope') scope?: string) {
    const chosen = SEARCH_SCOPES.includes(scope as SearchScope) ? (scope as SearchScope) : 'all';
    return this.units.tree(q ?? '', chosen);
  }

  /** Project, building and unit dropdowns for the public enrolment form. */
  @Get('enrollment-options')
  @Public()
  enrollmentOptions() {
    return this.units.enrollmentOptions();
  }

  @Get('settings')
  @Roles('Admin')
  settings() {
    return this.units.settingsList();
  }

  // ---- Projects, managed from the admin panel -------------------------
  // Declared before the ':project/:code' routes below, otherwise 'projects'
  // would be read as a project name.

  @Get('projects')
  @Roles('Admin')
  projects() {
    return this.units.projectList();
  }

  @Post('projects')
  @Roles('Admin')
  createProject(@Body() dto: CreateProjectDto) {
    return this.units.createProject(dto);
  }

  @Patch('projects/:name')
  @Roles('Admin')
  updateProject(@Param('name') name: string, @Body() dto: UpdateProjectDto) {
    return this.units.updateProject(name, dto);
  }

  @Delete('projects/:name')
  @Roles('Admin')
  removeProject(@Param('name') name: string) {
    return this.units.removeProject(name);
  }

  @Post('projects/:name/buildings')
  @Roles('Admin')
  addBuilding(@Param('name') name: string, @Body() dto: CreateBuildingDto) {
    return this.units.addBuilding(name, dto);
  }

  /** Many buildings at once; an existing code is skipped, not an error. */
  @Post('projects/:name/buildings/bulk')
  @Roles('Admin')
  addBuildings(@Param('name') name: string, @Body() dto: BulkBuildingsDto) {
    return this.units.addBuildings(name, dto.buildings);
  }

  @Delete('projects/:name/buildings/:code')
  @Roles('Admin')
  removeBuilding(@Param('name') name: string, @Param('code') code: string) {
    return this.units.removeBuilding(name, code);
  }

  // ---- Units inside one building ---------------------------------------
  // Declared before ':project/:code' so 'units' is not read as a code.

  @Post(':project/:code/units')
  @Roles('Admin')
  addUnits(@Param('project') project: string, @Param('code') code: string, @Body() dto: AddUnitsDto) {
    return this.units.addUnits(project, code, dto.units);
  }

  @Delete(':project/:code/units/:unit')
  @Roles('Admin')
  removeUnit(@Param('project') project: string, @Param('code') code: string, @Param('unit') unit: string) {
    return this.units.removeUnit(project, code, unit);
  }

  /** Assigns a unit to an owner, or clears it when they leave. */
  @Put(':project/:code/units/:unit/owner')
  @Roles('Admin')
  setUnitOwner(
    @Param('project') project: string, @Param('code') code: string,
    @Param('unit') unit: string, @Body() dto: SetUnitOwnerDto,
  ) {
    return this.units.setUnitOwner(project, code, unit, dto.owner);
  }

  @Get(':project/:code')
  findBuilding(@Param('project') project: string, @Param('code') code: string) {
    return this.units.findBuilding(project, code);
  }

  @Patch(':project/:code')
  @Roles('Admin')
  update(
    @Param('project') project: string,
    @Param('code') code: string,
    @Body() dto: UpdateBuildingSettingDto,
  ) {
    return this.units.upsertSetting(project, code, dto);
  }
}
