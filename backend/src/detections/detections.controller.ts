import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { DetectionsService } from './detections.service';
import { CreateDetectionDto } from './dto/create-detection.dto';
import { UpdateDetectionDto } from './dto/update-detection.dto';
import { Internal } from '../auth/auth.decorators';

@Controller('detections')
export class DetectionsController {
  constructor(private readonly detectionsService: DetectionsService) {}

  @Post()
  create(@Body() createDetectionDto: CreateDetectionDto) {
    return this.detectionsService.create(createDetectionDto);
  }

  @Post('ai-event')
  @Internal()
  createAiEvent(@Body() createDetectionDto: CreateDetectionDto) {
    return this.detectionsService.create(createDetectionDto);
  }

  @Get()
  findAll() {
    return this.detectionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.detectionsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDetectionDto: UpdateDetectionDto) {
    return this.detectionsService.update(id, updateDetectionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.detectionsService.remove(id);
  }
}
