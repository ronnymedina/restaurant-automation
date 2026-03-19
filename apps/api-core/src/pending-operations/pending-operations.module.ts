import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PendingOperationRepository } from './pending-operation.repository';
import { PendingOperationsService } from './pending-operations.service';
import { EmailModule } from '../email/email.module';
import { UserRepository } from '../users/user.repository';
import { userConfig } from '../users/users.config';

@Module({
  imports: [EmailModule, ConfigModule.forFeature(userConfig)],
  providers: [PendingOperationRepository, PendingOperationsService, UserRepository],
  exports: [PendingOperationsService],
})
export class PendingOperationsModule {}
