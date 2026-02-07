import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class OnboardingRegisterDto {
  @IsString()
  restaurantName: string;

  @IsOptional()
  @IsBoolean()
  skipProducts?: boolean;
}
