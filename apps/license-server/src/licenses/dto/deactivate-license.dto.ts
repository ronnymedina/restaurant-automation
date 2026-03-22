import { IsNotEmpty, IsString } from 'class-validator';

export class DeactivateLicenseDto {
  @IsString() @IsNotEmpty()
  licenseKey: string;
}
