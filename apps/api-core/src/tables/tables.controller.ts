import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { TableDto } from './dto/table.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('tables')
@ApiBearerAuth()
@Controller({ version: '1', path: 'tables' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar mesas del restaurante' })
  @ApiResponse({ status: 200, type: [TableDto] })
  findAll(@CurrentUser() user: { restaurantId: string }) {
    return this.tablesService.findAll(user.restaurantId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear mesa' })
  @ApiResponse({ status: 201, type: TableDto })
  create(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateTableDto,
  ) {
    return this.tablesService.create(user.restaurantId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar mesa (nombre, capacidad o estado activo)',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: TableDto })
  update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateTableDto,
  ) {
    return this.tablesService.update(id, user.restaurantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar mesa (solo si no tiene reservas futuras)',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204 })
  @ApiResponse({
    status: 409,
    description: 'La mesa tiene reservas futuras',
  })
  delete(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.tablesService.delete(id, user.restaurantId);
  }
}
