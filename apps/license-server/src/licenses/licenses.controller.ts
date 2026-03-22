import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiHeader } from '@nestjs/swagger';
import { LicensesService } from './licenses.service';
import { GenerateLicenseDto } from './dto/generate-license.dto';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { DeactivateLicenseDto } from './dto/deactivate-license.dto';
import { AdminGuard } from '../admin.guard';

@ApiTags('licenses')
@Controller('licenses')
export class LicensesController {
  constructor(private readonly service: LicensesService) {}

  @Post('generate')
  @UseGuards(AdminGuard)
  @ApiHeader({ name: 'x-admin-key', required: true })
  generate(@Body() dto: GenerateLicenseDto) {
    return this.service.generate(dto);
  }

  @Post('activate')
  activate(@Body() dto: ActivateLicenseDto) {
    return this.service.activate(dto);
  }

  @Post('deactivate')
  @UseGuards(AdminGuard)
  @ApiHeader({ name: 'x-admin-key', required: true })
  deactivate(@Body() dto: DeactivateLicenseDto) {
    return this.service.deactivate(dto);
  }

  @Get(':key/status')
  @UseGuards(AdminGuard)
  @ApiHeader({ name: 'x-admin-key', required: true })
  getStatus(@Param('key') key: string) {
    return this.service.getStatus(key);
  }
}
