import { Product } from '@prisma/client';
import { Exclude, Transform } from 'class-transformer';
import { fromCents } from '../../common/helpers/money';

export class ProductSerializer implements Omit<Product, 'price'> {
  id: string;
  name: string;
  description: string | null;

  @Transform(({ value }) => fromCents(value as bigint | number))
  price: number;

  stock: number | null;
  sku: string | null;
  imageUrl: string | null;
  active: boolean;
  categoryId: string;
  restaurantId: string;
  createdAt: Date;

  @Exclude()
  updatedAt: Date;

  @Exclude()
  deletedAt: Date | null;

  constructor(partial: Partial<Product>) {
    Object.assign(this, partial);
  }
}
