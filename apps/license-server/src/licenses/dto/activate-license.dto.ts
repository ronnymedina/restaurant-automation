import { IsNotEmpty, IsString } from 'class-validator';

export class ActivateLicenseDto {
  @IsString() @IsNotEmpty()
  licenseKey: string;

  @IsString() @IsNotEmpty()
  machineId: string;

  @IsString() @IsNotEmpty()
  platform: string;
}
