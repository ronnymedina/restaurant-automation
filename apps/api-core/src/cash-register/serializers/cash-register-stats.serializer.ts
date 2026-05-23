import { Exclude, Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { fromCents } from '../../common/helpers/money';
import { type ShiftStats } from '../cash-register-stats.service';

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
  @Transform(({ value }) => fromCents(value as bigint | number))
  @Expose() @ApiProperty() completed: number;

  @Transform(({ value }) => fromCents(value as bigint | number))
  @Expose() @ApiProperty() pending: number;

  @Transform(({ value }) => fromCents(value as bigint | number))
  @Expose() @ApiProperty() averageTicket: number;

  constructor(partial: { completed: bigint | number; pending: bigint | number; averageTicket: bigint | number }) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsByPaymentMethodSerializer {
  @Expose() @ApiProperty() method: string;
  @Expose() @ApiProperty() count: number;

  @Transform(({ value }) => fromCents(value as bigint | number))
  @Expose() @ApiProperty() total: number;

  constructor(partial: { method: string; count: number; total: bigint | number }) {
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

  @Transform(({ value }) => fromCents(value as bigint | number))
  @Expose() @ApiProperty() total: number;

  constructor(partial: { id: string; name: string; quantity: number; total: bigint | number }) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class CashShiftStatsSerializer {
  @Expose() @ApiProperty() total: number;
  @Expose() @ApiProperty() pending: number;

  @Expose()
  @ApiProperty({ type: [ShiftCountSerializer] })
  counts: ShiftCountSerializer[];

  @Expose()
  @ApiProperty({ type: StatsRevenueSerializer })
  revenue: StatsRevenueSerializer;

  @Expose()
  @ApiProperty({ type: [StatsByPaymentMethodSerializer] })
  byPaymentMethod: StatsByPaymentMethodSerializer[];

  @Expose()
  @ApiProperty({ type: [StatsByOrderTypeSerializer] })
  byOrderType: StatsByOrderTypeSerializer[];

  @Expose()
  @ApiProperty({ type: [StatsByOrderSourceSerializer] })
  byOrderSource: StatsByOrderSourceSerializer[];

  @Expose()
  @ApiProperty({ type: [StatsTopProductSerializer] })
  topProducts: StatsTopProductSerializer[];

  constructor(stats: ShiftStats) {
    this.total = stats.total;
    this.pending = stats.pending;
    this.counts = stats.counts.map((c) => new ShiftCountSerializer(c));
    this.revenue = new StatsRevenueSerializer(stats.revenue);
    this.byPaymentMethod = stats.byPaymentMethod.map(
      (x) => new StatsByPaymentMethodSerializer(x),
    );
    this.byOrderType   = stats.byOrderType.map((x)   => new StatsByOrderTypeSerializer(x));
    this.byOrderSource = stats.byOrderSource.map((x) => new StatsByOrderSourceSerializer(x));
    this.topProducts   = stats.topProducts.map((x)   => new StatsTopProductSerializer(x));
  }

  static empty(): CashShiftStatsSerializer {
    const empty: ShiftStats = {
      total: 0,
      pending: 0,
      counts: [],
      revenue: { completed: 0n, pending: 0n, averageTicket: 0n },
      byPaymentMethod: [],
      byOrderType: [],
      byOrderSource: [],
      topProducts: [],
    };
    return new CashShiftStatsSerializer(empty);
  }
}
