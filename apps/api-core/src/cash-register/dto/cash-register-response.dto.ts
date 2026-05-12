import { ApiProperty } from '@nestjs/swagger';

export class PaymentBreakdownItemDto {
  @ApiProperty() method: string;
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class SessionSummaryDto {
  @ApiProperty() totalOrders: number;
  @ApiProperty() totalSales: number;
  @ApiProperty({ type: [PaymentBreakdownItemDto] }) paymentBreakdown: PaymentBreakdownItemDto[];
}

export class CompletedGroupDto {
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class CancelledGroupDto {
  @ApiProperty() count: number;
}

export class NewSessionSummaryDto {
  @ApiProperty({ type: CompletedGroupDto }) completed: CompletedGroupDto;
  @ApiProperty({ type: CancelledGroupDto }) cancelled: CancelledGroupDto;
  @ApiProperty({ type: [PaymentBreakdownItemDto] }) paymentBreakdown: PaymentBreakdownItemDto[];
}

export class CashShiftDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiProperty() displayOpenedAt: string;
  @ApiProperty({ required: false, nullable: true }) displayClosedAt: string | null;
  @ApiProperty({ required: false, nullable: true }) closedBy: string | null;
  @ApiProperty({ required: false, nullable: true }) openedByEmail: string | null;
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
}
