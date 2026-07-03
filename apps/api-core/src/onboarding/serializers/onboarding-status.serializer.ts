import { ApiProperty } from '@nestjs/swagger';

export class OnboardingStatusSerializer {
  @ApiProperty({ description: 'true si el registro público de onboarding está disponible' })
  registrationOpen!: boolean;
}
