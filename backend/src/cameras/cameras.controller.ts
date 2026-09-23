import { BadGatewayException, Controller, Get, Post, Body, Patch, Param, Delete, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'stream';
import { CamerasService } from './cameras.service';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';
import { Public, Roles } from '../auth/auth.decorators';

@Controller('cameras')
export class CamerasController {
  constructor(private readonly camerasService: CamerasService) {}

  @Post()
  @Roles('Admin')
  create(@Body() createCameraDto: CreateCameraDto) {
    return this.camerasService.create(createCameraDto);
  }

  @Get()
  findAll() {
    return this.camerasService.findAll();
  }

  @Post(':id/stream-token')
  createStreamToken(@Param('id') id: string) {
    return this.camerasService.createStreamToken(id);
  }

  @Get('stream/:playbackId')
  @Public()
  async stream(
    @Param('playbackId') playbackId: string,
    @Query('token') token: string,
    @Res() response: Response,
  ) {
    const abort = new AbortController();
    response.on('close', () => abort.abort());
    const upstream = await this.camerasService.openStream(playbackId, token || '', abort.signal);
    if (!upstream.ok || !upstream.body) throw new BadGatewayException(`AI stream unavailable (${upstream.status})`);
    response.status(200);
    response.setHeader('Content-Type', upstream.headers.get('content-type') || 'multipart/x-mixed-replace; boundary=frame');
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    Readable.fromWeb(upstream.body as never).pipe(response);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.camerasService.findOne(id);
  }

  @Patch(':id')
  @Roles('Admin')
  update(@Param('id') id: string, @Body() updateCameraDto: UpdateCameraDto) {
    return this.camerasService.update(id, updateCameraDto);
  }

  @Delete(':id')
  @Roles('Admin')
  remove(@Param('id') id: string) {
    return this.camerasService.remove(id);
  }

  @Post(':id/test')
  @Roles('Admin')
  testConnection(@Param('id') id: string) {
    return this.camerasService.testConnection(id);
  }
}
