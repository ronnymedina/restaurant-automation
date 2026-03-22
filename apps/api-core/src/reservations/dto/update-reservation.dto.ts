import {
  IsString, IsInt, IsOptional, IsEmail, IsDateString,
  IsBoolean, Min, IsEnum, MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationStatus } from '@prisma/client';

export class UpdateReservationDto {
  @ApiPropertyOptional() @IsString() @MaxLength(200) @IsOptional() guestName?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(50) @IsOptional() guestPhone?: string;
  @ApiPropertyOptional() @IsEmail() @IsOptional() guestEmail?: string;
  @ApiPropertyOptional({ minimum: 1 }) @IsInt() @Min(1) @IsOptional() partySize?: number;
  @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional({ enum: ReservationStatus }) @IsEnum(ReservationStatus) @IsOptional() status?: ReservationStatus;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isPaid?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() paymentReference?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() paymentPlatform?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() cancellationReason?: string;
}
