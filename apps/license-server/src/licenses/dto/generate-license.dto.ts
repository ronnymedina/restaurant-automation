import { IsIn, IsOptional } from 'class-validator';

export class GenerateLicenseDto {
  @IsOptional()
  @IsIn(['desktop', 'cloud'])
  mode?: string;
}
