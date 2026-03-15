import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReservationDto {
  @ApiProperty() id: string;
  @ApiProperty() guestName: string;
  @ApiProperty() guestPhone: string;
  @ApiPropertyOptional() guestEmail?: string | null;
  @ApiProperty() partySize: number;
  @ApiProperty() date: Date;
  @ApiProperty() duration: number;
  @ApiProperty() status: string;
  @ApiPropertyOptional() notes?: string | null;
  @ApiProperty() isPaid: boolean;
  @ApiPropertyOptional() paymentReference?: string | null;
  @ApiPropertyOptional() paymentPlatform?: string | null;
  @ApiPropertyOptional() cancellationReason?: string | null;
  @ApiProperty() tableId: string;
  @ApiProperty() restaurantId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
