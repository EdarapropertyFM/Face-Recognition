import { Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

/**
 * AuthGuard puts the verified token payload on the request, and the payload
 * carries the username as `sub` (see UsersService.login) -- not as `u`.
 */
type AuthedRequest = { user?: { sub?: string; role?: string } };

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get('summary') summary() { return this.dashboard.summary(); }

  @Get('badges') badges(@Req() request: AuthedRequest) {
    return this.dashboard.badges(request.user?.sub);
  }

  /** Clears this user's alert notification count. */
  @Post('alerts-seen') markAlertsSeen(@Req() request: AuthedRequest) {
    const username = request.user?.sub;
    if (!username) throw new UnauthorizedException('Authentication token is required');
    return this.dashboard.markAlertsSeen(username);
  }
}
