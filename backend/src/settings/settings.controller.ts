import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { Roles } from '../auth/auth.decorators';

@Controller('settings')
@Roles('Admin')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  update(@Body() dto: UpdateSettingDto) {
    return this.settings.update(dto);
  }

  /** Run the retention purge now, rather than waiting for the hourly pass. */
  @Post('purge')
  purge() {
    return this.settings.purge();
  }
}
