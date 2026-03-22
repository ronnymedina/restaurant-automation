import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [LicensesController],
  providers: [LicensesService, PrismaService],
})
export class LicensesModule {}
