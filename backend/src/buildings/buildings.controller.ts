import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { BuildingsService } from './buildings.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import { Public, Roles } from '../auth/auth.decorators';

@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Post()
  @Roles('Admin')
  create(@Body() createBuildingDto: CreateBuildingDto) {
    return this.buildingsService.create(createBuildingDto);
  }

  @Get()
  findAll() {
    return this.buildingsService.findAll();
  }

  @Get('enrollment-options')
  @Public()
  enrollmentOptions() {
    return this.buildingsService.enrollmentOptions();
  }

  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.buildingsService.findOne(code);
  }

  @Patch(':code')
  @Roles('Admin')
  update(@Param('code') code: string, @Body() updateBuildingDto: UpdateBuildingDto) {
    return this.buildingsService.update(code, updateBuildingDto);
  }

  @Delete(':code')
  @Roles('Admin')
  remove(@Param('code') code: string) {
    return this.buildingsService.remove(code);
  }
}
