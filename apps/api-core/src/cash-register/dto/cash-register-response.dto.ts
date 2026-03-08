import { ApiProperty } from '@nestjs/swagger';

export class PaymentBreakdownDto {
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class SessionSummaryDto {
  @ApiProperty() totalOrders: number;
  @ApiProperty() totalSales: number;
  @ApiProperty({ required: false }) completedOrders?: number;
  @ApiProperty({ required: false }) cancelledOrders?: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/PaymentBreakdownDto' },
  })
  paymentBreakdown: Record<string, PaymentBreakdownDto>;
}

export class RegisterSessionDto {
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
  @ApiProperty({ type: RegisterSessionDto }) session: RegisterSessionDto;
  @ApiProperty({ type: SessionSummaryDto }) summary: SessionSummaryDto;
}

export class TopProductDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
  @ApiProperty() total: number;
}

export class SessionSummaryFullDto extends SessionSummaryDto {
  @ApiProperty({ type: [TopProductDto] }) topProducts: TopProductDto[];
}

export class SessionSummaryResponseDto {
  @ApiProperty({ type: RegisterSessionDto }) session: RegisterSessionDto;
  @ApiProperty({ type: SessionSummaryFullDto }) summary: SessionSummaryFullDto;
  @ApiProperty({ type: [Object] }) orders: any[];
}
