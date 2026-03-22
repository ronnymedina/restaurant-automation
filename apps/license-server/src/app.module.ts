import { Module } from '@nestjs/common';
import { LicensesModule } from './licenses/licenses.module';

@Module({
  imports: [LicensesModule],
})
export class AppModule {}
