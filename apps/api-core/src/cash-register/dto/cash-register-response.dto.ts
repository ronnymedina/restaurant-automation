import { ApiProperty } from '@nestjs/swagger';

// -- Money / breakdown DTOs --

export class PaymentBreakdownItemDto {
  @ApiProperty() method: string;
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class OrderTypeBreakdownItemDto {
  @ApiProperty() type: string;
  @ApiProperty() count: number;
}

export class OrderSourceBreakdownItemDto {
  @ApiProperty() source: string;
  @ApiProperty() count: number;
}

export class TopProductDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
  @ApiProperty() total: number;
}

// -- Summary DTOs --

export class ShiftCountsDto {
  @ApiProperty() total: number;
  @ApiProperty() pending: number;
  @ApiProperty() created: number;
  @ApiProperty() confirmed: number;
  @ApiProperty() processing: number;
  @ApiProperty() served: number;
  @ApiProperty() completed: number;
  @ApiProperty() cancelled: number;
}

export class ShiftRevenueDto {
  @ApiProperty() collected: number;
  @ApiProperty() pending: number;
  @ApiProperty() averageTicket: number;
}

export class ShiftSummaryDto {
  @ApiProperty({ type: ShiftCountsDto })                       counts: ShiftCountsDto;
  @ApiProperty({ type: ShiftRevenueDto })                      revenue: ShiftRevenueDto;
  @ApiProperty({ type: [PaymentBreakdownItemDto] })            byPaymentMethod: PaymentBreakdownItemDto[];
  @ApiProperty({ type: [OrderTypeBreakdownItemDto] })          byOrderType: OrderTypeBreakdownItemDto[];
  @ApiProperty({ type: [OrderSourceBreakdownItemDto] })        byOrderSource: OrderSourceBreakdownItemDto[];
  @ApiProperty({ type: [TopProductDto] })                      topProducts: TopProductDto[];
}

// -- Session DTO --

export class CashShiftDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiProperty() displayOpenedAt: string;
  @ApiProperty({ required: false, nullable: true }) displayClosedAt: string | null;
  @ApiProperty({ required: false, nullable: true }) closedBy: string | null;
  @ApiProperty({ required: false, nullable: true }) openedByEmail: string | null;
}

// -- Response wrappers --

export class CloseSessionResponseDto {
  @ApiProperty({ type: CashShiftDto })    session: CashShiftDto;
  @ApiProperty({ type: ShiftSummaryDto }) summary: ShiftSummaryDto;
}

export class SessionSummaryResponseDto {
  @ApiProperty({ type: CashShiftDto })    session: CashShiftDto;
  @ApiProperty({ type: ShiftSummaryDto }) summary: ShiftSummaryDto;
}

export class LiveStatsResponseDto {
  @ApiProperty({ type: ShiftSummaryDto }) summary: ShiftSummaryDto;
}

export class TopProductsResponseDto {
  @ApiProperty({ type: [TopProductDto] }) topProducts: TopProductDto[];
}
