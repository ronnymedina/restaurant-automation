import { Injectable } from '@nestjs/common';
import { Prisma, Restaurant } from '@prisma/client';
import * as ct from 'countries-and-timezones';
import { RestaurantRepository, RestaurantWithSettings } from './restaurant.repository';
import { TimezoneService } from './timezone.service';
import { UpdateRestaurantSettingsDto } from './dto/update-restaurant-settings.dto';
import {
  RestaurantNotFoundException,
  TimezoneNotAvailableForCountryException,
} from './exceptions/restaurants.exceptions';
import { RestaurantSettingsDto } from './dto/restaurant-settings.dto';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly restaurantRepository: RestaurantRepository,
    private readonly timezoneService: TimezoneService,
  ) {}

  async createRestaurant(name: string, timezone = 'UTC', tx?: TransactionClient): Promise<Restaurant> {
    const slug = await this.generateSlug(name, tx);
    return this.restaurantRepository.createWithSettings({ name, slug, timezone }, tx);
  }

  async findById(id: string): Promise<Restaurant | null> {
    return this.restaurantRepository.findById(id);
  }

  async findBySlug(slug: string): Promise<Restaurant | null> {
    return this.restaurantRepository.findBySlug(slug);
  }

  async findByIdWithDetails(id: string): Promise<Restaurant | null> {
    return this.restaurantRepository.findByIdWithRelations(id);
  }

  async findAll(): Promise<Restaurant[]> {
    return this.restaurantRepository.findAll();
  }

  async update(
    id: string,
    data: Prisma.RestaurantUpdateInput,
  ): Promise<Restaurant> {
    return this.restaurantRepository.update(id, data);
  }

  async delete(id: string): Promise<Restaurant> {
    return this.restaurantRepository.delete(id);
  }

  async findBySlugWithSettings(slug: string): Promise<RestaurantWithSettings | null> {
    return this.restaurantRepository.findBySlugWithSettings(slug);
  }

  async findByIdWithSettings(id: string): Promise<RestaurantWithSettings | null> {
    return this.restaurantRepository.findByIdWithSettings(id);
  }

  async upsertSettings(
    restaurantId: string,
    data: { kitchenTokenHash?: string; kitchenTokenExpiresAt?: Date },
  ) {
    return this.restaurantRepository.upsertSettings(restaurantId, data);
  }

  async updateSettings(
    restaurantId: string,
    dto: UpdateRestaurantSettingsDto,
  ): Promise<RestaurantSettingsDto> {
    const current = await this.restaurantRepository.findByIdWithSettings(restaurantId);
    if (!current || !current.settings) {
      throw new RestaurantNotFoundException(restaurantId);
    }

    if (dto.timezone && !this.isTimezoneAllowedForCountry(dto.timezone, current.settings.country)) {
      throw new TimezoneNotAvailableForCountryException(dto.timezone, current.settings.country);
    }

    const thousandsSeparator = dto.decimalSeparator
      ? (dto.decimalSeparator === '.' ? ',' : '.')
      : undefined;

    const newSlug = dto.name && dto.name !== current.name
      ? await this.generateSlug(dto.name)
      : undefined;

    const updated = await this.restaurantRepository.updateWithSettings(restaurantId, {
      restaurant: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(newSlug ? { slug: newSlug } : {}),
      },
      settings: {
        ...(dto.timezone ? { timezone: dto.timezone } : {}),
        ...(dto.currency ? { currency: dto.currency } : {}),
        ...(dto.decimalSeparator
          ? { decimalSeparator: dto.decimalSeparator, thousandsSeparator }
          : {}),
      },
    });

    if (dto.timezone && dto.timezone !== current.settings.timezone) {
      await this.timezoneService.invalidate(restaurantId);
    }

    return this.toSettingsDto(updated);
  }

  private isTimezoneAllowedForCountry(timezone: string, country: string): boolean {
    const timezones = ct.getCountry(country)?.timezones as string[] | undefined;
    return timezones?.includes(timezone) ?? false;
  }

  private toSettingsDto(
    restaurant: NonNullable<Awaited<ReturnType<RestaurantRepository['findByIdWithSettings']>>>,
  ): RestaurantSettingsDto {
    const s = restaurant.settings!;
    return {
      name: restaurant.name,
      slug: restaurant.slug,
      timezone: s.timezone,
      country: s.country,
      currency: s.currency,
      decimalSeparator: s.decimalSeparator,
      thousandsSeparator: s.thousandsSeparator,
    };
  }

  private async generateSlug(name: string, tx?: TransactionClient): Promise<string> {
    const base = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    let slug = base;
    let existing = await this.restaurantRepository.findBySlug(slug, tx);
    while (existing) {
      const suffix = Math.random().toString(36).substring(2, 6);
      slug = `${base}-${suffix}`;
      existing = await this.restaurantRepository.findBySlug(slug, tx);
    }
    return slug;
  }
}
