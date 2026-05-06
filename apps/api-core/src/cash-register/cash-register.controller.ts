import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { CashRegisterService } from './cash-register.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CashShiftSerializer } from './serializers/cash-shift.serializer';
import { PaginatedCashShiftsSerializer } from './serializers/paginated-cash-shifts.serializer';
import { CloseSessionResponseDto, SessionSummaryResponseDto } from './dto/cash-register-response.dto';

@ApiTags('Cash Register')
@ApiBearerAuth()
@Controller({ version: '1', path: 'cash-register' })
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class CashRegisterController {
  constructor(private readonly registerService: CashRegisterService) { }

  @Post('open')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Abrir sesión de caja' })
  @ApiResponse({ status: 201, description: 'Sesión creada exitosamente', type: CashShiftSerializer })
  @ApiResponse({ status: 409, description: 'Ya existe una sesión de caja abierta (CASH_REGISTER_ALREADY_OPEN)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async open(@CurrentUser() user: { restaurantId: string; id: string }) {
    const session = await this.registerService.openSession(user.restaurantId, user.id);
    return new CashShiftSerializer(session);
  }

  @Post('close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión de caja activa' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada con resumen de ventas', type: CloseSessionResponseDto })
  @ApiResponse({ status: 409, description: 'No hay sesión de caja abierta (NO_OPEN_CASH_REGISTER)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async close(@CurrentUser() user: { restaurantId: string; id: string }) {
    const result = await this.registerService.closeSession(user.restaurantId, user.id);
    return {
      session: new CashShiftSerializer(result.session),
      summary: result.summary,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Historial paginado de sesiones de caja' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Elementos por página (default: 10)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de sesiones', type: PaginatedCashShiftsSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async history(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ) {
    const result = await this.registerService.getSessionHistory(
      user.restaurantId,
      query.page,
      query.limit,
    );
    return new PaginatedCashShiftsSerializer({
      data: result.data.map(s => new CashShiftSerializer(s)),
      meta: result.meta,
    });
  }

  @Get('current')
  @ApiOperation({ summary: 'Sesión de caja actualmente abierta' })
  @ApiResponse({ status: 200, description: 'Sesión activa con conteo de órdenes, o {} si no hay sesión abierta', type: CashShiftSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async current(@CurrentUser() user: { restaurantId: string }) {
    const session = await this.registerService.getCurrentSession(user.restaurantId);
    if (!('id' in session)) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new CashShiftSerializer(session as any);
  }

  @Get('summary/:sessionId')
  @ApiOperation({ summary: 'Resumen detallado de una sesión de caja' })
  @ApiParam({ name: 'sessionId', description: 'ID de la sesión de caja', type: String })
  @ApiResponse({ status: 200, description: 'Resumen completo con órdenes y productos más vendidos', type: SessionSummaryResponseDto })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada (CASH_REGISTER_NOT_FOUND)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async summary(@Param('sessionId') sessionId: string) {
    const result = await this.registerService.getSessionSummary(sessionId);
    return {
      session: new CashShiftSerializer(result.session),
      summary: result.summary,
      orders: result.orders,
    };
  }
}
