import { ApiProperty } from '@nestjs/swagger';

export class CategoryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() restaurantId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
