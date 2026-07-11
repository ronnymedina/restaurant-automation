import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductDto } from '../../products/dto/product.dto';

export class MenuItemDto {
  @ApiProperty() id: string;
  @ApiProperty() menuId: string;
  @ApiProperty() productId: string;
  @ApiPropertyOptional({ nullable: true, example: 'Para Empezar' }) sectionName: string | null;
  @ApiProperty({ example: 0 }) order: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class MenuItemWithProductDto extends MenuItemDto {
  @ApiProperty({ type: () => ProductDto }) product: ProductDto;
}

export class MenuDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() active: boolean;
  @ApiPropertyOptional({ nullable: true, example: '12:00' }) startTime: string | null;
  @ApiPropertyOptional({ nullable: true, example: '15:00' }) endTime: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'MON,TUE,WED,THU,FRI' }) daysOfWeek: string | null;
  @ApiProperty() restaurantId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class MenuWithItemsDto extends MenuDto {
  @ApiProperty({ type: [MenuItemWithProductDto] }) items: MenuItemWithProductDto[];
}

export class BulkCreateResultDto {
  @ApiProperty({ example: 5, description: 'Número de items creados' }) created: number;
}
