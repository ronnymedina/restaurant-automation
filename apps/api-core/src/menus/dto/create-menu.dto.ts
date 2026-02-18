import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateMenuDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:MM format' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime must be in HH:MM format' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^(MON|TUE|WED|THU|FRI|SAT|SUN)(,(MON|TUE|WED|THU|FRI|SAT|SUN))*$/, {
    message: 'daysOfWeek must be comma-separated: MON,TUE,WED,THU,FRI,SAT,SUN',
  })
  daysOfWeek?: string;
}
