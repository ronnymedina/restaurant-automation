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
import { CashRegisterStatsService } from './cash-register-stats.service';
import { TimezoneService } from '../restaurants/timezone.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CashShiftSerializer } from './serializers/cash-shift.serializer';
import { CashShiftStatsSerializer } from './serializers/cash-register-stats.serializer';
import { PaginatedCashShiftsSerializer } from './serializers/paginated-cash-shifts.serializer';
import {
  CloseSessionResponseDto,
  SessionSummaryResponseDto,
  TopProductsResponseDto,
  CashShiftStatsResponseDto,
} from './dto/cash-register-response.dto';
import {
  serializeSessionSummary,
  serializeTopProducts,
} from './serializers/session-summary.serializer';

@ApiTags('Cash Register')
@ApiBearerAuth()
@Controller({ version: '1', path: 'cash-register' })
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class CashRegisterController {
  constructor(
    private readonly registerService: CashRegisterService,
    private readonly statsService: CashRegisterStatsService,
    private readonly timezoneService: TimezoneService,
  ) {}

  @Post('open')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Abrir sesión de caja' })
  @ApiResponse({ status: 201, description: 'Sesión creada exitosamente', type: CashShiftSerializer })
  @ApiResponse({ status: 409, description: 'Ya existe una sesión de caja abierta (CASH_REGISTER_ALREADY_OPEN)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async open(@CurrentUser() user: { restaurantId: string; id: string }) {
    const [session, tz] = await Promise.all([
      this.registerService.openSession(user.restaurantId, user.id),
      this.timezoneService.getTimezone(user.restaurantId),
    ]);
    return new CashShiftSerializer(session, tz);
  }

  @Post('close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión de caja activa' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada con estadísticas completas' })
  @ApiResponse({ status: 409, description: 'No hay sesión de caja abierta o hay pedidos pendientes' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async close(@CurrentUser() user: { restaurantId: string; id: string }) {
    const [result, tz] = await Promise.all([
      this.registerService.closeSession(user.restaurantId, user.id),
      this.timezoneService.getTimezone(user.restaurantId),
    ]);
    return {
      session: new CashShiftSerializer(result.session, tz),
      stats:   new CashShiftStatsSerializer(result.stats),
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Historial paginado de sesiones de caja' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: PaginatedCashShiftsSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async history(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ) {
    const [result, tz] = await Promise.all([
      this.registerService.getSessionHistory(user.restaurantId, query.page, query.limit),
      this.timezoneService.getTimezone(user.restaurantId),
    ]);
    return new PaginatedCashShiftsSerializer({
      data: result.data.map((s) => new CashShiftSerializer(s, tz)),
      meta: result.meta,
    });
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Estadísticas en vivo de la sesión de caja activa' })
  @ApiResponse({ status: 200, type: CashShiftStatsResponseDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async stats(@CurrentUser() user: { restaurantId: string }) {
    const session = await this.registerService.getCurrentSession(user.restaurantId);
    if (!('id' in session)) {
      return CashShiftStatsSerializer.empty();
    }
    const stats = await this.statsService.getStats(
      (session as { id: string }).id,
      user.restaurantId,
    );
    return new CashShiftStatsSerializer(stats);
  }

  @Get('current')
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Sesión de caja actualmente abierta' })
  @ApiResponse({ status: 200, type: CashShiftSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN, MANAGER o BASIC)' })
  async current(@CurrentUser() user: { restaurantId: string }) {
    const [session, tz] = await Promise.all([
      this.registerService.getCurrentSession(user.restaurantId),
      this.timezoneService.getTimezone(user.restaurantId),
    ]);
    if (!('id' in session)) return {};
    return new CashShiftSerializer(session as any, tz);
  }

  @Get('summary/:sessionId')
  @ApiOperation({ summary: 'Resumen detallado de una sesión de caja' })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiResponse({ status: 200, type: SessionSummaryResponseDto })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada (CASH_REGISTER_NOT_FOUND)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async summary(
    @CurrentUser() user: { restaurantId: string },
    @Param('sessionId') sessionId: string,
  ) {
    const [result, tz] = await Promise.all([
      this.registerService.getSessionSummary(sessionId),
      this.timezoneService.getTimezone(user.restaurantId),
    ]);
    return {
      session: new CashShiftSerializer(result.session, tz),
      summary: serializeSessionSummary(result.summary),
    };
  }

  @Get('top-products/:sessionId')
  @ApiOperation({ summary: 'Top 5 productos más vendidos de una sesión' })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiResponse({ status: 200, type: TopProductsResponseDto })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada (CASH_REGISTER_NOT_FOUND)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async topProducts(@Param('sessionId') sessionId: string) {
    const result = await this.registerService.getTopProducts(sessionId);
    return { topProducts: serializeTopProducts(result.topProducts) };
  }
}
