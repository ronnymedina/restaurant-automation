import { Test, TestingModule } from '@nestjs/testing';
import { ReservationStatus } from '@prisma/client';
import { ReservationsService } from './reservations.service';
import { ReservationsRepository } from './reservations.repository';
import { TablesRepository } from '../tables/tables.repository';
import { RestaurantsService } from '../restaurants/restaurants.service';
import {
  ReservationNotFoundException,
  ReservationTableInactiveException,
  ReservationCapacityExceededException,
  ReservationTimeOverlapException,
  ReservationInvalidStatusTransitionException,
} from './exceptions/reservations.exceptions';
import { TableNotFoundException } from '../tables/exceptions/tables.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';

const mockReservationsRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  findOverlapping: jest.fn(),
};
const mockTablesRepo = {
  findById: jest.fn(),
};
const mockRestaurantsService = {
  findById: jest.fn(),
};

const makeTable = (overrides = {}) => ({
  id: 't1',
  name: 'Mesa 1',
  capacity: 4,
  active: true,
  restaurantId: 'r1',
  ...overrides,
});

const makeReservation = (overrides = {}) => ({
  id: 'res1',
  restaurantId: 'r1',
  tableId: 't1',
  guestName: 'Juan',
  guestPhone: '1234',
  partySize: 2,
  date: new Date('2026-03-15T20:00:00Z'),
  duration: 90,
  status: ReservationStatus.PENDING,
  isPaid: false,
  ...overrides,
});

const makeCreateDto = (overrides = {}) => ({
  guestName: 'Juan',
  guestPhone: '1234',
  partySize: 2,
  date: '2026-03-15T20:00:00.000Z',
  tableId: 't1',
  ...overrides,
});

describe('ReservationsService', () => {
  let service: ReservationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: ReservationsRepository, useValue: mockReservationsRepo },
        { provide: TablesRepository, useValue: mockTablesRepo },
        { provide: RestaurantsService, useValue: mockRestaurantsService },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
    jest.clearAllMocks();

    // Default happy-path mocks
    mockTablesRepo.findById.mockResolvedValue(makeTable());
    mockRestaurantsService.findById.mockResolvedValue({ defaultReservationDuration: 90 });
    mockReservationsRepo.findOverlapping.mockResolvedValue([]);
    mockReservationsRepo.create.mockResolvedValue(makeReservation());
  });

  describe('findById', () => {
    it('throws ReservationNotFoundException when not found', async () => {
      mockReservationsRepo.findById.mockResolvedValue(null);
      await expect(service.findById('res1', 'r1')).rejects.toThrow(ReservationNotFoundException);
    });

    it('throws ForbiddenAccessException on restaurant mismatch', async () => {
      mockReservationsRepo.findById.mockResolvedValue(makeReservation({ restaurantId: 'other' }));
      await expect(service.findById('res1', 'r1')).rejects.toThrow(ForbiddenAccessException);
    });
  });

  describe('create', () => {
    it('throws TableNotFoundException when table not found', async () => {
      mockTablesRepo.findById.mockResolvedValue(null);
      await expect(service.create('r1', makeCreateDto())).rejects.toThrow(TableNotFoundException);
    });

    it('throws TableNotFoundException when table belongs to different restaurant', async () => {
      mockTablesRepo.findById.mockResolvedValue(makeTable({ restaurantId: 'other' }));
      await expect(service.create('r1', makeCreateDto())).rejects.toThrow(TableNotFoundException);
    });

    it('throws ReservationTableInactiveException when table is inactive', async () => {
      mockTablesRepo.findById.mockResolvedValue(makeTable({ active: false }));
      await expect(service.create('r1', makeCreateDto())).rejects.toThrow(
        ReservationTableInactiveException,
      );
    });

    it('throws ReservationCapacityExceededException when party size exceeds capacity', async () => {
      mockTablesRepo.findById.mockResolvedValue(makeTable({ capacity: 2 }));
      await expect(service.create('r1', makeCreateDto({ partySize: 5 }))).rejects.toThrow(
        ReservationCapacityExceededException,
      );
    });

    it('throws ReservationTimeOverlapException when slot is taken', async () => {
      const conflicting = makeReservation();
      mockReservationsRepo.findOverlapping.mockResolvedValue([conflicting]);
      await expect(service.create('r1', makeCreateDto())).rejects.toThrow(
        ReservationTimeOverlapException,
      );
    });

    it('creates reservation using restaurant default duration', async () => {
      await service.create('r1', makeCreateDto());
      expect(mockReservationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ duration: 90, restaurantId: 'r1' }),
      );
    });
  });

  describe('update', () => {
    it('throws ReservationInvalidStatusTransitionException for invalid transition', async () => {
      mockReservationsRepo.findById.mockResolvedValue(
        makeReservation({ status: ReservationStatus.COMPLETED }),
      );
      await expect(
        service.update('res1', 'r1', { status: ReservationStatus.PENDING }),
      ).rejects.toThrow(ReservationInvalidStatusTransitionException);
    });

    it('updates reservation when transition is valid', async () => {
      mockReservationsRepo.findById.mockResolvedValue(
        makeReservation({ status: ReservationStatus.PENDING }),
      );
      mockReservationsRepo.update.mockResolvedValue(
        makeReservation({ status: ReservationStatus.CONFIRMED }),
      );
      await service.update('res1', 'r1', { status: ReservationStatus.CONFIRMED });
      expect(mockReservationsRepo.update).toHaveBeenCalledWith(
        'res1',
        expect.objectContaining({ status: ReservationStatus.CONFIRMED }),
      );
    });
  });

  describe('cancel', () => {
    it('throws ReservationInvalidStatusTransitionException when cancelling from COMPLETED', async () => {
      mockReservationsRepo.findById.mockResolvedValue(
        makeReservation({ status: ReservationStatus.COMPLETED }),
      );
      await expect(service.cancel('res1', 'r1')).rejects.toThrow(
        ReservationInvalidStatusTransitionException,
      );
    });

    it('cancels reservation from CONFIRMED status', async () => {
      mockReservationsRepo.findById.mockResolvedValue(
        makeReservation({ status: ReservationStatus.CONFIRMED }),
      );
      mockReservationsRepo.update.mockResolvedValue(
        makeReservation({ status: ReservationStatus.CANCELLED }),
      );
      await service.cancel('res1', 'r1', 'cliente canceló');
      expect(mockReservationsRepo.update).toHaveBeenCalledWith(
        'res1',
        expect.objectContaining({
          status: ReservationStatus.CANCELLED,
          cancellationReason: 'cliente canceló',
        }),
      );
    });
  });
});
