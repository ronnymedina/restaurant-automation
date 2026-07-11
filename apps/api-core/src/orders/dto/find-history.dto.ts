import { Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsOptional, Matches, Min,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

import { PaginationDto } from '../../common/dto/pagination.dto';
import { ValidDateRange } from './validators/valid-date-range.validator';

export class FindHistoryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orderNumber debe ser entero' })
  @Min(1, { message: 'orderNumber debe ser >= 1' })
  orderNumber?: number;

  @IsOptional()
  @IsEnum(OrderStatus, { message: 'status inválido' })
  status?: OrderStatus;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom debe ser YYYY-MM-DD' })
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo debe ser YYYY-MM-DD' })
  @ValidDateRange()
  dateTo?: string;
}
