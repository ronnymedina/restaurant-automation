import { Injectable, Logger } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';

import { ReservationsRepository } from './reservations.repository';
import { TablesRepository } from '../tables/tables.repository';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import {
  ReservationNotFoundException,
  ReservationTableInactiveException,
  ReservationCapacityExceededException,
  ReservationTimeOverlapException,
  ReservationInvalidStatusTransitionException,
} from './exceptions/reservations.exceptions';
import { TableNotFoundException } from '../tables/exceptions/tables.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';
import { RestaurantsService } from '../restaurants/restaurants.service';

// NOTE: EmailService is intentionally NOT injected here.
// Reservation confirmation emails are a stub (logger only).
// Wire EmailService in when an email template for reservations is ready.

const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  [ReservationStatus.PENDING]: [ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED],
  [ReservationStatus.CONFIRMED]: [ReservationStatus.SEATED, ReservationStatus.CANCELLED],
  [ReservationStatus.SEATED]: [
    ReservationStatus.COMPLETED,
    ReservationStatus.NO_SHOW,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.COMPLETED]: [],
  [ReservationStatus.NO_SHOW]: [],
  [ReservationStatus.CANCELLED]: [],
};

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    private readonly tablesRepository: TablesRepository,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  async findAll(
    restaurantId: string,
    filters: { date?: string; status?: ReservationStatus; tableId?: string },
  ) {
    return this.reservationsRepository.findAll(restaurantId, filters);
  }

  async findById(id: string, restaurantId: string) {
    const reservation = await this.reservationsRepository.findById(id);
    if (!reservation) throw new ReservationNotFoundException(id);
    if (reservation.restaurantId !== restaurantId) throw new ForbiddenAccessException();
    return reservation;
  }

  async create(restaurantId: string, dto: CreateReservationDto) {
    // 1. Table exists and belongs to restaurant
    const table = await this.tablesRepository.findById(dto.tableId);
    if (!table || table.restaurantId !== restaurantId) throw new TableNotFoundException(dto.tableId);

    // 2. Table is active
    if (!table.active) throw new ReservationTableInactiveException(dto.tableId);

    // 3. Capacity check
    if (table.capacity < dto.partySize) {
      throw new ReservationCapacityExceededException(dto.partySize, table.capacity);
    }

    // 4. Get restaurant default duration
    const restaurant = await this.restaurantsService.findById(restaurantId);
    const duration = restaurant!.defaultReservationDuration;

    // 5. Overlap check
    const newStart = new Date(dto.date);
    const newEnd = new Date(newStart.getTime() + duration * 60_000);
    const overlapping = await this.reservationsRepository.findOverlapping(
      dto.tableId,
      newStart,
      newEnd,
    );
    if (overlapping.length > 0) {
      const conflict = overlapping[0];
      const conflictEnd = new Date(conflict.date.getTime() + conflict.duration * 60_000);
      throw new ReservationTimeOverlapException(conflict.date, conflictEnd);
    }

    // 6. Persist
    const reservation = await this.reservationsRepository.create({
      guestName: dto.guestName,
      guestPhone: dto.guestPhone,
      guestEmail: dto.guestEmail,
      partySize: dto.partySize,
      date: newStart,
      duration,
      notes: dto.notes,
      isPaid: dto.isPaid ?? false,
      paymentReference: dto.paymentReference,
      paymentPlatform: dto.paymentPlatform,
      tableId: dto.tableId,
      restaurantId,
    });

    // 7. Fire-and-forget email stub
    if (dto.guestEmail) {
      void Promise.resolve().then(() =>
        this.logger.log(
          `[DEV] Would send confirmation to ${dto.guestEmail} for reservation ${reservation.id}`,
        ),
      );
    }

    return reservation;
  }

  async update(id: string, restaurantId: string, dto: UpdateReservationDto) {
    const reservation = await this.findById(id, restaurantId);

    if (dto.status !== undefined) {
      const allowed = VALID_TRANSITIONS[reservation.status];
      if (!allowed.includes(dto.status)) {
        throw new ReservationInvalidStatusTransitionException(reservation.status, dto.status);
      }
    }

    const updateData: Record<string, any> = {};
    if (dto.guestName !== undefined) updateData.guestName = dto.guestName;
    if (dto.guestPhone !== undefined) updateData.guestPhone = dto.guestPhone;
    if (dto.guestEmail !== undefined) updateData.guestEmail = dto.guestEmail;
    if (dto.partySize !== undefined) updateData.partySize = dto.partySize;
    if (dto.date !== undefined) updateData.date = new Date(dto.date);
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.isPaid !== undefined) updateData.isPaid = dto.isPaid;
    if (dto.paymentReference !== undefined) updateData.paymentReference = dto.paymentReference;
    if (dto.paymentPlatform !== undefined) updateData.paymentPlatform = dto.paymentPlatform;
    if (dto.cancellationReason !== undefined) updateData.cancellationReason = dto.cancellationReason;

    return this.reservationsRepository.update(id, updateData);
  }

  async cancel(id: string, restaurantId: string, reason?: string) {
    const reservation = await this.findById(id, restaurantId);
    const allowed = VALID_TRANSITIONS[reservation.status];
    if (!allowed.includes(ReservationStatus.CANCELLED)) {
      throw new ReservationInvalidStatusTransitionException(
        reservation.status,
        ReservationStatus.CANCELLED,
      );
    }
    return this.reservationsRepository.update(id, {
      status: ReservationStatus.CANCELLED,
      cancellationReason: reason ?? null,
    });
  }
}
