import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [LicensesController],
  providers: [
    LicensesService,
    { provide: PrismaClient, useValue: new PrismaClient() },
  ],
})
export class LicensesModule {}
