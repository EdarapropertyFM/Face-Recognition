import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_INTERNAL, IS_PUBLIC, ROLES } from './auth.decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]) || this.reflector.getAllAndOverride<boolean>(IS_INTERNAL, [context.getHandler(), context.getClass()])) return true;
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    if (!roles.includes(context.switchToHttp().getRequest().user?.role)) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
