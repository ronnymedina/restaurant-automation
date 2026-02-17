import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller({ version: '1', path: 'products' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ) {
    return this.productsService.findByRestaurantIdPaginated(
      user.restaurantId,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.productsService.findById(id, user.restaurantId);
  }

  @Post()
  async create(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateProductDto,
  ) {
    const { categoryId, ...data } = dto;
    return this.productsService.createProduct(user.restaurantId, data, categoryId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(id, user.restaurantId, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.productsService.deleteProduct(id, user.restaurantId);
  }
}
