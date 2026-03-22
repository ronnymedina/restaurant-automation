import {
  IsString, IsInt, IsOptional, IsEmail, IsDateString,
  IsBoolean, Min, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReservationDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @MaxLength(200)
  guestName: string;

  @ApiProperty({ example: '+54 9 11 1234-5678' })
  @IsString()
  @MaxLength(50)
  guestPhone: string;

  @ApiPropertyOptional({ example: 'juan@email.com' })
  @IsEmail()
  @IsOptional()
  guestEmail?: string;

  @ApiProperty({ example: 3, minimum: 1 })
  @IsInt()
  @Min(1)
  partySize: number;

  @ApiProperty({ example: '2026-03-15T20:00:00.000Z' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 'Aniversario, traer torta' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ example: 'uuid-de-la-mesa' })
  @IsString()
  tableId: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;

  @ApiPropertyOptional({ example: 'MP-123456' })
  @IsString()
  @IsOptional()
  paymentReference?: string;

  @ApiPropertyOptional({ example: 'MercadoPago' })
  @IsString()
  @IsOptional()
  paymentPlatform?: string;
}
