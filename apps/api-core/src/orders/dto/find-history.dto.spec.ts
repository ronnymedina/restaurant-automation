import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { FindHistoryDto } from './find-history.dto';

async function findError<T extends object>(dto: T, property: string) {
  const errors = await validate(dto);
  return errors.find((e) => e.property === property);
}

describe('FindHistoryDto', () => {
  describe('orderNumber', () => {
    it('acepta valor válido', async () => {
      const dto = plainToInstance(FindHistoryDto, { orderNumber: '5' });
      expect(await findError(dto, 'orderNumber')).toBeUndefined();
    });

    it('rechaza no-numérico', async () => {
      const dto = plainToInstance(FindHistoryDto, { orderNumber: 'abc' });
      expect(await findError(dto, 'orderNumber')).toBeDefined();
    });

    it('rechaza valor < 1', async () => {
      const dto = plainToInstance(FindHistoryDto, { orderNumber: '0' });
      expect(await findError(dto, 'orderNumber')).toBeDefined();
    });
  });

  describe('status', () => {
    it('acepta valor del enum', async () => {
      const dto = plainToInstance(FindHistoryDto, { status: 'COMPLETED' });
      expect(await findError(dto, 'status')).toBeUndefined();
    });

    it('rechaza valor fuera del enum', async () => {
      const dto = plainToInstance(FindHistoryDto, { status: 'BLAH' });
      expect(await findError(dto, 'status')).toBeDefined();
    });
  });

  describe('dateFrom / dateTo formato', () => {
    it('acepta YYYY-MM-DD', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-01-15' });
      expect(await findError(dto, 'dateFrom')).toBeUndefined();
    });

    it('rechaza ISO con hora', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-01-15T12:00:00Z' });
      expect(await findError(dto, 'dateFrom')).toBeDefined();
    });

    it('rechaza texto libre', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateTo: 'hoy' });
      expect(await findError(dto, 'dateTo')).toBeDefined();
    });
  });

  describe('rango de fechas', () => {
    it('acepta rango válido < 90d', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-01-01', dateTo: '2026-01-15' });
      expect(await findError(dto, 'dateTo')).toBeUndefined();
    });

    it('rechaza dateFrom > dateTo', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-02-01', dateTo: '2026-01-01' });
      expect(await findError(dto, 'dateTo')).toBeDefined();
    });

    it('rechaza rango > 90 días', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-01-01', dateTo: '2026-12-31' });
      expect(await findError(dto, 'dateTo')).toBeDefined();
    });

    it('acepta solo dateFrom (sin tope)', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-01-01' });
      expect(await findError(dto, 'dateTo')).toBeUndefined();
    });
  });

  describe('limit / page', () => {
    it('acepta limit=100', async () => {
      const dto = plainToInstance(FindHistoryDto, { limit: '100' });
      expect(await findError(dto, 'limit')).toBeUndefined();
    });

    it('rechaza limit=101', async () => {
      const dto = plainToInstance(FindHistoryDto, { limit: '101' });
      expect(await findError(dto, 'limit')).toBeDefined();
    });

    it('rechaza limit no-numérico', async () => {
      const dto = plainToInstance(FindHistoryDto, { limit: 'abc' });
      expect(await findError(dto, 'limit')).toBeDefined();
    });

    it('rechaza page=0', async () => {
      const dto = plainToInstance(FindHistoryDto, { page: '0' });
      expect(await findError(dto, 'page')).toBeDefined();
    });
  });

  it('caso completo válido pasa sin errores', async () => {
    const dto = plainToInstance(FindHistoryDto, {
      orderNumber: '5', status: 'COMPLETED',
      dateFrom: '2026-01-01', dateTo: '2026-01-31',
      page: '1', limit: '20',
    });
    expect(await validate(dto)).toEqual([]);
  });
});
