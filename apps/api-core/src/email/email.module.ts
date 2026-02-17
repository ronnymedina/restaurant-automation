import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

import { ConfigModule } from '@nestjs/config';
import { emailConfig } from './email.config';

@Module({
  imports: [ConfigModule.forFeature(emailConfig)],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule { }
