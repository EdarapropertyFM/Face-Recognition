import { BadGatewayException, Controller, Get, Post, Body, Patch, Param, Delete, Logger, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'stream';
import { CamerasService } from './cameras.service';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';
import { ImportDvrDto } from './dto/import-dvr.dto';
import { Public, Roles } from '../auth/auth.decorators';
import { isAbort } from './abort';

@Controller('cameras')
export class CamerasController {
  private readonly logger = new Logger(CamerasController.name);

  constructor(private readonly camerasService: CamerasService) {}

  @Post()
  @Roles('Admin')
  create(@Body() createCameraDto: CreateCameraDto) {
    return this.camerasService.create(createCameraDto);
  }

  /** Create one camera per channel of a DVR, in a single action. */
  @Post('import-dvr')
  @Roles('Admin')
  importDvr(@Body() importDvrDto: ImportDvrDto) {
    return this.camerasService.importDvr(importDvrDto);
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

    // A viewer closing an MJPEG tile — navigating away, collapsing a DVR
    // group, reloading — aborts this request. That is ordinary, so it must
    // not surface as a logged ERROR with a stack trace; only genuine
    // upstream failures should.
    let opened: Awaited<ReturnType<CamerasService['openStream']>>;
    try {
      opened = await this.camerasService.openStream(playbackId, token || '', abort.signal);
    } catch (error) {
      if (isAbort(error) || response.closed) return;
      throw error;
    }

    const { upstream, cameraId } = opened;
    if (!upstream.ok || !upstream.body) throw new BadGatewayException(`AI stream unavailable (${upstream.status})`);

    // Whatever ends this stream -- the viewer closing a tile, the AI
    // dropping it, an error -- the camera stops counting as watched exactly
    // once, so the health prober knows when to resume checking it.
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.camerasService.viewerLeft(cameraId);
    };
    response.on('close', release);
    response.on('finish', release);
    response.status(200);
    response.setHeader('Content-Type', upstream.headers.get('content-type') || 'multipart/x-mixed-replace; boundary=frame');
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    // Same again for a disconnect mid-stream: without a handler the aborted
    // read would raise an unhandled 'error' on the readable.
    const body = Readable.fromWeb(upstream.body as never);
    body.on('error', (error) => {
      release();
      if (!isAbort(error)) this.logger.warn(`camera stream ${playbackId} ended: ${error.message}`);
      // End rather than destroy: destroy() sends a TCP reset, which any proxy
      // in front of us reports as ECONNRESET even though this is an ordinary
      // viewer closing a tile.
      if (!response.writableEnded) response.end();
    });
    body.pipe(response);
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
