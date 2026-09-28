import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DetectionsService } from './detections.service';
import { CreateDetectionDto } from './dto/create-detection.dto';
import { UpdateDetectionDto } from './dto/update-detection.dto';
import { Internal, Public } from '../auth/auth.decorators';

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

  /**
   * The face image saved with a detection, proxied from the AI.
   *
   * Proxied rather than linked directly so the browser needs no second
   * origin and no knowledge of where the AI service lives, and so the image
   * is behind the same authentication as everything else.
   */
  @Get('snapshot/*path')
  @Public()
  async snapshot(
    @Param('path') path: string | string[],
    @Query('token') token: string,
    @Res() response: Response,
  ) {
    const rel = Array.isArray(path) ? path.join('/') : path;
    const image = await this.detectionsService.snapshot(rel, token || '');
    response.setHeader('Content-Type', 'image/jpeg');
    response.setHeader('Cache-Control', 'private, max-age=86400');
    response.send(image);
  }

  @Get('subjects')
  subjects() {
    return this.detectionsService.subjects();
  }

  @Get('history/:face')
  history(@Param('face') face: string) {
    return this.detectionsService.history(face);
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
