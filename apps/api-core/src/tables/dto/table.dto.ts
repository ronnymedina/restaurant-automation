import { ApiProperty } from '@nestjs/swagger';

export class TableDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() capacity: number;
  @ApiProperty() active: boolean;
  @ApiProperty() restaurantId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
