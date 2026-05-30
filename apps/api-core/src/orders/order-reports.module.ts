import { Module } from '@nestjs/common';

import { OrderShiftReportRepository } from './order-shift-report.repository';

/**
 * Sub-module that exposes only the reporting/aggregation repository for orders.
 *
 * Created during the audit batch of BAJOS (H-44) to break the heavy
 * `CashRegisterModule → OrdersModule` import. CashRegister only consumes
 * `OrderShiftReportRepository`; importing the full `OrdersModule` (services,
 * controllers, EmailModule, PrintModule, EventsModule, forwardRef chains)
 * pulled in the entire write-path stack just to read aggregations.
 *
 * Modules that need read-only order aggregations import this module instead.
 * `OrdersModule` re-exports the same repository so the dependency direction
 * is acyclic.
 */
@Module({
  providers: [OrderShiftReportRepository],
  exports: [OrderShiftReportRepository],
})
export class OrderReportsModule {}
