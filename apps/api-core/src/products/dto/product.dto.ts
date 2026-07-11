import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) description: string | null;
  @ApiProperty() price: number;
  @ApiPropertyOptional({ nullable: true, description: 'null = ilimitado, 0 = agotado' }) stock: number | null;
  @ApiProperty() active: boolean;
  @ApiPropertyOptional({ nullable: true }) sku: string | null;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
  @ApiProperty() restaurantId: string;
  @ApiProperty() categoryId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
