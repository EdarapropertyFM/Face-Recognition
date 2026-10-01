import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** Everything the Reports page draws. `days` is clamped to 1..365. */
  @Get('analytics')
  analytics(
    @Query('days') days?: string,
    @Query('project') project?: string,
    @Query('building') building?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.analytics(Number(days) || 30, {
      project: project?.trim() || undefined,
      building: building?.trim() || undefined,
      from: from?.trim() || undefined,
      to: to?.trim() || undefined,
    });
  }
}
