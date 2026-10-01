import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Roles } from '../auth/auth.decorators';

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** Readable by any signed-in user: the UI hides what the role cannot open. */
  @Get()
  list() {
    return this.roles.list();
  }

  @Patch(':role')
  @Roles('Admin')
  update(@Param('role') role: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(role, dto);
  }

  @Post(':role/reset')
  @Roles('Admin')
  reset(@Param('role') role: string) {
    return this.roles.reset(role);
  }
}
