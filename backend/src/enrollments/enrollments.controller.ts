import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators';
import { Roles } from '../auth/auth.decorators';
import { CheckFaceFrameDto } from './dto/check-face-frame.dto';
import { CaptureFacesDto } from './dto/capture-faces.dto';
import { RateLimit } from '../common/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';

@ApiTags('enrollments')
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  @Roles('Admin')
  create(@Body() createEnrollmentDto: CreateEnrollmentDto) {
    return this.enrollmentsService.create(createEnrollmentDto);
  }

  @Post('self-service')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 15 * 60 * 1000 })
  createSelfService(@Body() createEnrollmentDto: CreateEnrollmentDto) {
    return this.enrollmentsService.createSelfService(createEnrollmentDto);
  }

  @Post('face-check')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 80, windowMs: 60 * 1000 })
  checkFace(@Body() body: CheckFaceFrameDto) {
    return this.enrollmentsService.checkFaceFrame(body.image_b64, body.aiPersonId);
  }

  /**
   * Enrolls the five captured photos into the AI gallery straight away and
   * returns the id for the draft to carry, so the person is recognizable
   * before the rest of the form is filled in.
   */
  @Post('face-capture')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 15 * 60 * 1000 })
  captureFaces(@Body() body: CaptureFacesDto) {
    return this.enrollmentsService.captureFaces(body.images, body.name);
  }

  /** Discards an unsubmitted capture so the applicant can retake their photos. */
  @Delete('face-capture/:aiPersonId')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 15 * 60 * 1000 })
  releaseCapture(@Param('aiPersonId') aiPersonId: string) {
    return this.enrollmentsService.releaseCapture(aiPersonId);
  }

  @Get()
  findAll() {
    return this.enrollmentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.enrollmentsService.findOne(id);
  }

  @Patch(':id')
  @Roles('Admin', 'Supervisor')
  update(@Param('id') id: string, @Body() updateEnrollmentDto: UpdateEnrollmentDto & { status?: string }) {
    return this.enrollmentsService.update(id, updateEnrollmentDto);
  }

  @Delete(':id')
  @Roles('Admin')
  remove(@Param('id') id: string) {
    return this.enrollmentsService.remove(id);
  }
}
