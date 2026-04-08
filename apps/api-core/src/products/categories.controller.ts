import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';

import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { DeleteCategoryDto } from './dto/delete-category.dto';
import { CheckDeleteCategoryResponseDto } from './dto/check-delete-category-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedCategoriesResponseDto } from './dto/paginated-categories-response.dto';
import { CategoryDto } from './dto/category.dto';

@ApiTags('categories')
@ApiBearerAuth()
@Controller({ version: '1', path: 'categories' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Listar categorías (paginado)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de categorías', type: PaginatedCategoriesResponseDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ) {
    return this.categoriesService.findByRestaurantIdPaginated(
      user.restaurantId,
      query.page,
      query.limit,
    );
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Crear una categoría' })
  @ApiResponse({ status: 201, description: 'Categoría creada', type: CategoryDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  @ApiResponse({ status: 409, description: 'Nombre duplicado en el restaurante' })
  async create(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.createCategory(user.restaurantId, dto.name);
  }

  @Get(':id/check-delete')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Verificar impacto de eliminar una categoría' })
  @ApiParam({ name: 'id', description: 'ID de la categoría', type: String })
  @ApiResponse({ status: 200, description: 'Resultado del chequeo', type: CheckDeleteCategoryResponseDto })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async checkDelete(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.categoriesService.checkDelete(id, user.restaurantId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Actualizar una categoría' })
  @ApiParam({ name: 'id', description: 'ID de la categoría', type: String })
  @ApiResponse({ status: 200, description: 'Categoría actualizada', type: CategoryDto })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({ status: 403, description: 'Sin permisos o categoría default protegida' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.updateCategory(id, user.restaurantId, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Eliminar una categoría (con reasignación opcional)' })
  @ApiParam({ name: 'id', description: 'ID de la categoría', type: String })
  @ApiBody({ type: DeleteCategoryDto, required: false })
  @ApiResponse({ status: 200, description: 'Categoría eliminada', type: CategoryDto })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({ status: 403, description: 'Categoría default protegida' })
  @ApiResponse({ status: 409, description: 'Tiene productos asignados — requiere reassignTo' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: DeleteCategoryDto,
  ) {
    return this.categoriesService.deleteCategory(id, user.restaurantId, {
      reassignTo: dto?.reassignTo,
    });
  }
}
