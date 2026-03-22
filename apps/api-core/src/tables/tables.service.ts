import { Injectable } from '@nestjs/common';
import { TablesRepository } from './tables.repository';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import {
  TableNotFoundException,
  TableHasFutureReservationsException,
} from './exceptions/tables.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';

@Injectable()
export class TablesService {
  constructor(private readonly tablesRepository: TablesRepository) {}

  async findAll(restaurantId: string) {
    return this.tablesRepository.findAll(restaurantId);
  }

  async findById(id: string, restaurantId: string) {
    const table = await this.tablesRepository.findById(id);
    if (!table) throw new TableNotFoundException(id);
    if (table.restaurantId !== restaurantId) throw new ForbiddenAccessException();
    return table;
  }

  async create(restaurantId: string, dto: CreateTableDto) {
    return this.tablesRepository.create({ ...dto, restaurantId });
  }

  async update(id: string, restaurantId: string, dto: UpdateTableDto) {
    await this.findById(id, restaurantId);
    return this.tablesRepository.update(id, dto);
  }

  async delete(id: string, restaurantId: string) {
    await this.findById(id, restaurantId);
    const futureCount = await this.tablesRepository.countFutureReservations(id);
    if (futureCount > 0) throw new TableHasFutureReservationsException(id);
    return this.tablesRepository.delete(id);
  }
}
