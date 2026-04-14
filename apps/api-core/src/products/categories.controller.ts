import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, UseInterceptors,
  ClassSerializerInterceptor, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiNoContentResponse,
} from '@nestjs/swagger';

import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { DeleteCategoryDto } from './dto/delete-category.dto';
import { CheckDeleteCategoryResponseDto } from './dto/check-delete-category-response.dto';
import { ProductCategorySerializer } from './serializers/product-category.serializer';
import { PaginatedProductCategoriesSerializer } from './serializers/paginated-product-categories.serializer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('categories')
@ApiBearerAuth()
@Controller({ version: '1', path: 'categories' })
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class ProductCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Listar categorías del restaurante (paginado)' })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de categorías. Cada ítem expone id, name e isDefault.',
    type: PaginatedProductCategoriesSerializer,
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ): Promise<PaginatedProductCategoriesSerializer> {
    const result = await this.categoriesService.findByRestaurantIdPaginated(
      user.restaurantId,
      query.page,
      query.limit,
    );
    return new PaginatedProductCategoriesSerializer({
      meta: result.meta,
      data: result.data.map((c) => new ProductCategorySerializer(c)),
    });
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Crear una categoría de producto' })
  @ApiResponse({
    status: 201,
    description: 'Categoría creada. Retorna id, name e isDefault.',
    type: ProductCategorySerializer,
  })
  @ApiResponse({ status: 400, description: 'Validación fallida (name vacío o > 255 chars)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  @ApiResponse({ status: 409, description: 'Nombre duplicado en el restaurante (DUPLICATE_ENTITY)' })
  async create(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateCategoryDto,
  ): Promise<ProductCategorySerializer> {
    const category = await this.categoriesService.createCategory(user.restaurantId, dto.name);
    return new ProductCategorySerializer(category);
  }

  @Get(':id/check-delete')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'Verificar impacto de eliminar una categoría',
    description: 'Retorna la cantidad de productos afectados, si es default y si se puede eliminar directamente sin reasignación.',
  })
  @ApiParam({ name: 'id', description: 'ID de la categoría', type: String })
  @ApiResponse({ status: 200, description: 'Resultado del chequeo', type: CheckDeleteCategoryResponseDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada o no pertenece al restaurante' })
  async checkDelete(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ): Promise<CheckDeleteCategoryResponseDto> {
    return this.categoriesService.checkDelete(id, user.restaurantId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Actualizar nombre de una categoría' })
  @ApiParam({ name: 'id', description: 'ID de la categoría', type: String })
  @ApiResponse({
    status: 200,
    description: 'Categoría actualizada. Retorna id, name e isDefault.',
    type: ProductCategorySerializer,
  })
  @ApiResponse({ status: 400, description: 'Validación fallida (name > 255 chars)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos o categoría default protegida (DEFAULT_CATEGORY_PROTECTED)' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada o no pertenece al restaurante' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateCategoryDto,
  ): Promise<ProductCategorySerializer> {
    const category = await this.categoriesService.updateCategory(id, user.restaurantId, dto);
    return new ProductCategorySerializer(category);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar una categoría',
    description: 'Elimina la categoría. Si tiene productos asignados se debe proveer `reassignTo` para reasignarlos antes de eliminar. Las categorías default no pueden eliminarse.',
  })
  @ApiParam({ name: 'id', description: 'ID de la categoría', type: String })
  @ApiBody({ type: DeleteCategoryDto, required: false })
  @ApiNoContentResponse({ description: 'Categoría eliminada correctamente' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos o categoría default protegida (DEFAULT_CATEGORY_PROTECTED)' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada o no pertenece al restaurante' })
  @ApiResponse({ status: 409, description: 'Tiene productos asignados — proveer reassignTo (CATEGORY_HAS_PRODUCTS)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: DeleteCategoryDto,
  ): Promise<void> {
    await this.categoriesService.deleteCategory(id, user.restaurantId, {
      reassignTo: dto?.reassignTo,
    });
  }
}
