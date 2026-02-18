import { Module } from '@nestjs/common';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserRepository } from './user.repository';

import { ConfigModule } from '@nestjs/config';
import { userConfig } from './users.config';

@Module({
  imports: [ConfigModule.forFeature(userConfig)],
  controllers: [UsersController],
  providers: [UsersService, UserRepository],
  exports: [UsersService],
})
export class UsersModule {}
