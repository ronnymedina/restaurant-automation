import { ApiProperty } from '@nestjs/swagger';

export class PaymentBreakdownDto {
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class OrderStatusGroupDto {
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class SessionSummaryDto {
  @ApiProperty() totalOrders: number;
  @ApiProperty() totalSales: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/PaymentBreakdownDto' },
  })
  paymentBreakdown: Record<string, PaymentBreakdownDto>;
}

export class OrdersByStatusDto {
  @ApiProperty({ type: OrderStatusGroupDto }) CREATED: OrderStatusGroupDto;
  @ApiProperty({ type: OrderStatusGroupDto }) PROCESSING: OrderStatusGroupDto;
  @ApiProperty({ type: OrderStatusGroupDto }) COMPLETED: OrderStatusGroupDto;
  @ApiProperty({ type: OrderStatusGroupDto }) CANCELLED: OrderStatusGroupDto;
}

export class NewSessionSummaryDto {
  @ApiProperty({ type: OrdersByStatusDto }) ordersByStatus: OrdersByStatusDto;
  @ApiProperty() totalSales: number;
  @ApiProperty() totalOrders: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/PaymentBreakdownDto' },
  })
  paymentBreakdown: Record<string, PaymentBreakdownDto>;
}

export class CashShiftDto {
  @ApiProperty() id: string;
  @ApiProperty() restaurantId: string;
  @ApiProperty() status: string;
  @ApiProperty() openedAt: Date;
  @ApiProperty({ required: false, nullable: true }) closedAt: Date | null;
  @ApiProperty({ required: false, nullable: true }) totalSales: number | null;
  @ApiProperty({ required: false, nullable: true }) totalOrders: number | null;
  @ApiProperty({ required: false, nullable: true }) closedBy: string | null;
}

export class CloseSessionResponseDto {
  @ApiProperty({ type: CashShiftDto }) session: CashShiftDto;
  @ApiProperty({ type: SessionSummaryDto }) summary: SessionSummaryDto;
}

export class TopProductDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
  @ApiProperty() total: number;
}

export class TopProductsResponseDto {
  @ApiProperty({ type: [TopProductDto] }) topProducts: TopProductDto[];
}

export class SessionSummaryResponseDto {
  @ApiProperty({ type: CashShiftDto }) session: CashShiftDto;
  @ApiProperty({ type: NewSessionSummaryDto }) summary: NewSessionSummaryDto;
  @ApiProperty({ type: [Object] }) orders: any[];
}
