import { Exclude, Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { fromCents } from '../../common/helpers/money';
import { type ShiftSummary } from '../cash-register-stats.service';

@Exclude()
export class ShiftCountsSerializer {
  @Expose() @ApiProperty() total: number;
  @Expose() @ApiProperty() pending: number;
  @Expose() @ApiProperty() created: number;
  @Expose() @ApiProperty() confirmed: number;
  @Expose() @ApiProperty() processing: number;
  @Expose() @ApiProperty() served: number;
  @Expose() @ApiProperty() completed: number;
  @Expose() @ApiProperty() cancelled: number;

  constructor(partial: Partial<ShiftCountsSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsRevenueSerializer {
  @Transform(({ value }) => fromCents(value as bigint | number))
  @Expose() @ApiProperty() collected: number;

  @Transform(({ value }) => fromCents(value as bigint | number))
  @Expose() @ApiProperty() pending: number;

  @Transform(({ value }) => fromCents(value as bigint | number))
  @Expose() @ApiProperty() averageTicket: number;

  constructor(partial: { collected: bigint | number; pending: bigint | number; averageTicket: bigint | number }) {
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
export class ShiftSummarySerializer {
  @Expose()
  @ApiProperty({ type: ShiftCountsSerializer })
  counts: ShiftCountsSerializer;

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

  constructor(summary: ShiftSummary) {
    this.counts = new ShiftCountsSerializer(summary.counts);
    this.revenue = new StatsRevenueSerializer(summary.revenue);
    this.byPaymentMethod = summary.byPaymentMethod.map(
      (x) => new StatsByPaymentMethodSerializer(x),
    );
    this.byOrderType   = summary.byOrderType.map((x)   => new StatsByOrderTypeSerializer(x));
    this.byOrderSource = summary.byOrderSource.map((x) => new StatsByOrderSourceSerializer(x));
    this.topProducts   = summary.topProducts.map((x)   => new StatsTopProductSerializer(x));
  }

  static empty(): ShiftSummarySerializer {
    const empty: ShiftSummary = {
      counts: { total: 0, pending: 0, created: 0, confirmed: 0, processing: 0, served: 0, completed: 0, cancelled: 0 },
      revenue: { collected: 0n, pending: 0n, averageTicket: 0n },
      byPaymentMethod: [],
      byOrderType: [],
      byOrderSource: [],
      topProducts: [],
    };
    return new ShiftSummarySerializer(empty);
  }
}
