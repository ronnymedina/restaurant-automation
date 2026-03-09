import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, PaymentMethod } from '@prisma/client';

export class OrderItemDto {
  @ApiProperty() id: string;
  @ApiProperty() orderId: string;
  @ApiProperty() productId: string;
  @ApiPropertyOptional({ nullable: true }) menuItemId: string | null;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPrice: number;
  @ApiProperty() subtotal: number;
  @ApiPropertyOptional({ nullable: true }) notes: string | null;
  @ApiProperty() createdAt: Date;
}

export class OrderDto {
  @ApiProperty() id: string;
  @ApiProperty() orderNumber: number;
  @ApiProperty({ enum: OrderStatus }) status: OrderStatus;
  @ApiPropertyOptional({ enum: PaymentMethod, nullable: true }) paymentMethod: PaymentMethod | null;
  @ApiPropertyOptional({ nullable: true }) customerEmail: string | null;
  @ApiProperty() totalAmount: number;
  @ApiProperty() isPaid: boolean;
  @ApiPropertyOptional({ nullable: true }) cancellationReason: string | null;
  @ApiProperty() restaurantId: string;
  @ApiProperty() registerSessionId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class OrderWithItemsDto extends OrderDto {
  @ApiProperty({ type: [OrderItemDto] }) items: OrderItemDto[];
}
