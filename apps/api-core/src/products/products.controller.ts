import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, UseInterceptors, ClassSerializerInterceptor,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ProductDto } from './dto/product.dto';
import { ProductSerializer } from './serializers/product.serializer';
import { ProductListSerializer } from './serializers/product-list.serializer';
import { PaginatedProductsSerializer } from './serializers/paginated-products.serializer';

@ApiTags('products')
@ApiBearerAuth()
@Controller({ version: '1', path: 'products' })
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) { }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Listar productos (paginado)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de productos', type: PaginatedProductsSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async listProducts(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ) {
    const result = await this.productsService.listProductsWithPagination(
      user.restaurantId,
      query.page,
      query.limit,
    );

    return new PaginatedProductsSerializer({
      meta: result.meta,
      data: result.data.map(p => new ProductListSerializer(p))
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Obtener producto por ID' })
  @ApiParam({ name: 'id', description: 'ID del producto', type: String })
  @ApiResponse({ status: 200, description: 'Producto encontrado', type: ProductDto })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    const product = await this.productsService.findById(id, user.restaurantId);
    return new ProductSerializer(product);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Crear un producto' })
  @ApiResponse({ status: 201, description: 'Producto creado', type: ProductSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: { restaurantId: string },
  ) {
    const product = await this.productsService.createProduct(user.restaurantId, createProductDto);
    return new ProductSerializer(product);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Actualizar un producto' })
  @ApiParam({ name: 'id', description: 'ID del producto', type: String })
  @ApiResponse({ status: 200, description: 'Producto actualizado', type: ProductDto })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() user: { restaurantId: string },
  ) {
    const product = await this.productsService.updateProduct(id, user.restaurantId, updateProductDto);
    return new ProductSerializer(product);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar producto (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID del producto', type: String })
  @ApiResponse({ status: 204, description: 'Producto desactivado' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ): Promise<void> {
    await this.productsService.deleteProduct(id, user.restaurantId);
  }
}
