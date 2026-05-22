import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { fromCents } from '../../common/helpers/money';
import { ShiftStats, emptyShiftStats } from '../cash-register-stats.service';

@Exclude()
export class ShiftCountSerializer {
  @Expose() @ApiProperty() status: string;
  @Expose() @ApiProperty() total: number;

  constructor(partial: Partial<ShiftCountSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsRevenueSerializer {
  @Expose() @ApiProperty() completed: number;
  @Expose() @ApiProperty() pending: number;
  @Expose() @ApiProperty() averageTicket: number;

  constructor(partial: Partial<StatsRevenueSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsByPaymentMethodSerializer {
  @Expose() @ApiProperty() method: string;
  @Expose() @ApiProperty() count: number;
  @Expose() @ApiProperty() total: number;

  constructor(partial: Partial<StatsByPaymentMethodSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsByOrderTypeSerializer {
  @Expose() @ApiProperty() type: string;
  @Expose() @ApiProperty() count: number;

  constructor(partial: Partial<StatsByOrderTypeSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsByOrderSourceSerializer {
  @Expose() @ApiProperty() source: string;
  @Expose() @ApiProperty() count: number;

  constructor(partial: Partial<StatsByOrderSourceSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsTopProductSerializer {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() name: string;
  @Expose() @ApiProperty() quantity: number;
  @Expose() @ApiProperty() total: number;

  constructor(partial: Partial<StatsTopProductSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class CashShiftStatsSerializer {
  @Expose() @ApiProperty() total: number;
  @Expose() @ApiProperty() pending: number;

  @Expose()
  @ApiProperty({ type: [ShiftCountSerializer] })
  @Type(() => ShiftCountSerializer)
  counts: ShiftCountSerializer[];

  @Expose()
  @ApiProperty({ type: StatsRevenueSerializer })
  @Type(() => StatsRevenueSerializer)
  revenue: StatsRevenueSerializer;

  @Expose()
  @ApiProperty({ type: [StatsByPaymentMethodSerializer] })
  @Type(() => StatsByPaymentMethodSerializer)
  byPaymentMethod: StatsByPaymentMethodSerializer[];

  @Expose()
  @ApiProperty({ type: [StatsByOrderTypeSerializer] })
  @Type(() => StatsByOrderTypeSerializer)
  byOrderType: StatsByOrderTypeSerializer[];

  @Expose()
  @ApiProperty({ type: [StatsByOrderSourceSerializer] })
  @Type(() => StatsByOrderSourceSerializer)
  byOrderSource: StatsByOrderSourceSerializer[];

  @Expose()
  @ApiProperty({ type: [StatsTopProductSerializer] })
  @Type(() => StatsTopProductSerializer)
  topProducts: StatsTopProductSerializer[];

  constructor(stats: ShiftStats) {
    this.total = stats.total;
    this.pending = stats.pending;
    this.counts = stats.counts.map((c) => new ShiftCountSerializer(c));
    this.revenue = new StatsRevenueSerializer({
      completed:     fromCents(stats.revenue.completed),
      pending:       fromCents(stats.revenue.pending),
      averageTicket: fromCents(stats.revenue.averageTicket),
    });
    this.byPaymentMethod = stats.byPaymentMethod.map(
      (x) => new StatsByPaymentMethodSerializer({ method: x.method, count: x.count, total: fromCents(x.total) }),
    );
    this.byOrderType   = stats.byOrderType.map((x)   => new StatsByOrderTypeSerializer(x));
    this.byOrderSource = stats.byOrderSource.map((x) => new StatsByOrderSourceSerializer(x));
    this.topProducts   = stats.topProducts.map(
      (x) => new StatsTopProductSerializer({ id: x.id, name: x.name, quantity: x.quantity, total: fromCents(x.total) }),
    );
  }

  static empty(): CashShiftStatsSerializer {
    return new CashShiftStatsSerializer(emptyShiftStats());
  }
}
