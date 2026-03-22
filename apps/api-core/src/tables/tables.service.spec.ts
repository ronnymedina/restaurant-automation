import { Test, TestingModule } from '@nestjs/testing';
import { TablesService } from './tables.service';
import { TablesRepository } from './tables.repository';
import {
  TableNotFoundException,
  TableHasFutureReservationsException,
} from './exceptions/tables.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';

const mockRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  countFutureReservations: jest.fn(),
};

const makeTable = (overrides = {}) => ({
  id: 't1',
  name: 'Mesa 1',
  capacity: 4,
  active: true,
  restaurantId: 'r1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('TablesService', () => {
  let service: TablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: TablesRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<TablesService>(TablesService);
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('throws TableNotFoundException when table not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('t1', 'r1')).rejects.toThrow(TableNotFoundException);
    });

    it('throws ForbiddenAccessException when restaurant mismatch', async () => {
      mockRepo.findById.mockResolvedValue(makeTable({ restaurantId: 'other' }));
      await expect(service.findById('t1', 'r1')).rejects.toThrow(ForbiddenAccessException);
    });

    it('returns table when found and restaurantId matches', async () => {
      const table = makeTable();
      mockRepo.findById.mockResolvedValue(table);
      const result = await service.findById('t1', 'r1');
      expect(result).toBe(table);
    });
  });

  describe('create', () => {
    it('creates table with restaurantId', async () => {
      const created = makeTable();
      mockRepo.create.mockResolvedValue(created);
      await service.create('r1', { name: 'Mesa 1', capacity: 4 });
      expect(mockRepo.create).toHaveBeenCalledWith({
        name: 'Mesa 1',
        capacity: 4,
        restaurantId: 'r1',
      });
    });
  });

  describe('update', () => {
    it('validates ownership before updating', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.update('t1', 'r1', { name: 'X' })).rejects.toThrow(
        TableNotFoundException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('updates table when authorized', async () => {
      mockRepo.findById.mockResolvedValue(makeTable());
      mockRepo.update.mockResolvedValue(makeTable({ name: 'Mesa X' }));
      await service.update('t1', 'r1', { name: 'Mesa X' });
      expect(mockRepo.update).toHaveBeenCalledWith('t1', { name: 'Mesa X' });
    });
  });

  describe('delete', () => {
    it('throws TableHasFutureReservationsException when future reservations exist', async () => {
      mockRepo.findById.mockResolvedValue(makeTable());
      mockRepo.countFutureReservations.mockResolvedValue(2);
      await expect(service.delete('t1', 'r1')).rejects.toThrow(
        TableHasFutureReservationsException,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('deletes table when no future reservations', async () => {
      const table = makeTable();
      mockRepo.findById.mockResolvedValue(table);
      mockRepo.countFutureReservations.mockResolvedValue(0);
      mockRepo.delete.mockResolvedValue(table);
      await service.delete('t1', 'r1');
      expect(mockRepo.delete).toHaveBeenCalledWith('t1');
    });
  });
});
