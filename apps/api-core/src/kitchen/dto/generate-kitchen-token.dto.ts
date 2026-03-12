import { IsDateString, IsOptional } from 'class-validator';

export class GenerateKitchenTokenDto {
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
