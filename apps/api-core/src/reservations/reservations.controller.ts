import {
  Controller, Get, Post, Patch, Delete, Param, Query,
  Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Role, ReservationStatus } from '@prisma/client';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse,
  ApiParam, ApiQuery,
} from '@nestjs/swagger';

import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationDto } from './dto/reservation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('reservations')
@ApiBearerAuth()
@Controller({ version: '1', path: 'reservations' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar reservas (filtros: date, status, tableId)' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Formato YYYY-MM-DD' })
  @ApiQuery({ name: 'status', required: false, enum: ReservationStatus })
  @ApiQuery({ name: 'tableId', required: false, type: String })
  @ApiResponse({ status: 200, type: [ReservationDto] })
  findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query('date') date?: string,
    @Query('status') status?: ReservationStatus,
    @Query('tableId') tableId?: string,
  ) {
    return this.reservationsService.findAll(user.restaurantId, { date, status, tableId });
  }

  @Post()
  @ApiOperation({ summary: 'Crear reserva con validación completa' })
  @ApiResponse({ status: 201, type: ReservationDto })
  @ApiResponse({ status: 400, description: 'Mesa inactiva o capacidad insuficiente' })
  @ApiResponse({ status: 409, description: 'Solapamiento de horario' })
  create(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateReservationDto,
  ) {
    return this.reservationsService.create(user.restaurantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar datos o cambiar estado de la reserva' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: ReservationDto })
  update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateReservationDto,
  ) {
    return this.reservationsService.update(id, user.restaurantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancelar reserva' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'reason', required: false, type: String })
  @ApiResponse({ status: 204 })
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Query('reason') reason?: string,
  ) {
    return this.reservationsService.cancel(id, user.restaurantId, reason);
  }
}
