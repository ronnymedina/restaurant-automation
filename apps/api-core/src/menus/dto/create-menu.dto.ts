import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMenuDto {
  @ApiProperty({ example: 'Almuerzo Ejecutivo', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: '12:00', description: 'Hora de inicio (formato HH:MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:MM format' })
  startTime?: string;

  @ApiPropertyOptional({ example: '15:00', description: 'Hora de fin (formato HH:MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime must be in HH:MM format' })
  endTime?: string;

  @ApiPropertyOptional({ example: 'MON,TUE,WED,THU,FRI', description: 'Días separados por coma: MON,TUE,WED,THU,FRI,SAT,SUN', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^(MON|TUE|WED|THU|FRI|SAT|SUN)(,(MON|TUE|WED|THU|FRI|SAT|SUN))*$/, {
    message: 'daysOfWeek must be comma-separated: MON,TUE,WED,THU,FRI,SAT,SUN',
  })
  daysOfWeek?: string;
}
