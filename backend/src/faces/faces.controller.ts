import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { FacesService } from './faces.service';
import { CreateFaceDto } from './dto/create-face.dto';
import { UpdateFaceDto } from './dto/update-face.dto';
import { ApiTags, ApiQuery } from '@nestjs/swagger';

@ApiTags('faces')
@Controller('faces')
export class FacesController {
  constructor(private readonly facesService: FacesService) {}

  @Post()
  create(@Body() createFaceDto: CreateFaceDto) {
    return this.facesService.create(createFaceDto);
  }

  @Get()
  @ApiQuery({ name: 'type', required: false })
  findAll(@Query('type') type?: string) {
    return this.facesService.findAll(type);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.facesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFaceDto: UpdateFaceDto) {
    return this.facesService.update(id, updateFaceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.facesService.remove(id);
  }
}
