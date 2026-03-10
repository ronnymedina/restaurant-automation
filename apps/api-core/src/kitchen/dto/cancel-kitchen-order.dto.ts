import { IsString, MinLength } from 'class-validator';

export class CancelKitchenOrderDto {
  @IsString()
  @MinLength(3)
  reason: string;
}
