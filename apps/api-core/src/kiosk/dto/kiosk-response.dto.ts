import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KioskStatusDto {
  @ApiProperty({ example: true, description: 'Indica si hay una caja registradora abierta' })
  registerOpen: boolean;

  @ApiProperty({ example: 'La Parrilla del Chef', description: 'Nombre del restaurante' })
  restaurantName: string;
}

export class KioskMenuItemEntryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) description: string | null;
  @ApiProperty() price: number;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
  @ApiProperty() stockStatus: string;
  @ApiPropertyOptional({ nullable: true }) stock: number | null;
}

export class KioskMenuItemsResponseDto {
  @ApiProperty() menuId: string;
  @ApiProperty() menuName: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'array', items: { $ref: '#/components/schemas/KioskMenuItemEntryDto' } },
    description: 'Secciones del menú con sus items',
  })
  sections: Record<string, KioskMenuItemEntryDto[]>;
}

export class KioskMenuDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() active: boolean;
  @ApiPropertyOptional({ nullable: true }) startTime: string | null;
  @ApiPropertyOptional({ nullable: true }) endTime: string | null;
  @ApiPropertyOptional({ nullable: true }) daysOfWeek: string | null;
}

export class KioskOrderItemDto {
  @ApiProperty() id: string;
  @ApiProperty() productId: string;
  @ApiPropertyOptional({ nullable: true }) menuItemId: string | null;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPrice: number;
  @ApiProperty() subtotal: number;
  @ApiPropertyOptional({ nullable: true }) notes: string | null;
}

export class KioskOrderStatusDto {
  @ApiProperty() id: string;
  @ApiProperty() orderNumber: number;
  @ApiProperty() status: string;
  @ApiProperty() totalAmount: number;
  @ApiProperty({ type: [KioskOrderItemDto] }) items: KioskOrderItemDto[];
  @ApiProperty() createdAt: Date;
}
