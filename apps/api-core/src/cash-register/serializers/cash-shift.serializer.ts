import { CashShift, CashShiftStatus } from '@prisma/client';
import { Exclude, Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CashShiftWithUser } from '../../cash-shift/cash-shift.repository';
import { fromCents } from '../../common/helpers/money';

@Exclude()
export class CashShiftSerializer implements Pick<CashShift, 'id' | 'status'> {
  @ApiProperty()
  @Expose()
  id: string;

  // not exposed: restaurantId, userId, lastOrderNumber, openingBalance, totalSales, totalOrders
  restaurantId: string;
  userId: string;
  lastOrderNumber: number;
  // Defensive @Transform: si alguien expone este campo por error con @Expose(),
  // el BigInt se convierte a pesos en lugar de filtrarse crudo (que rompería JSON.stringify).
  @Transform(({ value }) => (typeof value === 'bigint' ? fromCents(value) : value))
  openingBalance: bigint;
  // Defensive @Transform: ver openingBalance.
  @Transform(({ value }) => (typeof value === 'bigint' ? fromCents(value) : value))
  totalSales: bigint | null;
  totalOrders: number | null;
  openedAt: Date;
  closedAt: Date | null;

  @ApiProperty({ enum: CashShiftStatus })
  @Expose()
  status: CashShiftStatus;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  closedBy: string | null;

  @ApiProperty()
  @Expose()
  displayOpenedAt: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  displayClosedAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  openedByEmail: string | null;

  constructor(partial: Partial<CashShiftWithUser>, timezone = 'UTC') {
    Object.assign(this, partial);
    const fmt = safeFormatter(timezone);
    const formatDate = (date: Date): string => {
      const p = fmt.formatToParts(date);
      const get = (type: string) => p.find((x) => x.type === type)?.value ?? '00';
      return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
    };
    this.displayOpenedAt = formatDate(new Date(partial.openedAt!));
    this.displayClosedAt = partial.closedAt ? formatDate(new Date(partial.closedAt)) : null;
    this.openedByEmail = (partial as any).user?.email ?? null;
  }
}

/**
 * Construye un `Intl.DateTimeFormat` para la zona horaria pedida; si la
 * zona es inválida (p.ej. cadena vacía o ID no soportado por el runtime),
 * cae a UTC en lugar de lanzar. Evita que un dato malformado en el modelo
 * Restaurant rompa toda la serialización del cash shift. (H-29)
 */
function safeFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return new Intl.DateTimeFormat('es', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }
}
