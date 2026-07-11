import { instanceToPlain } from 'class-transformer';
import { ProductSerializer } from '../src/products/serializers/product.serializer';

describe('ProductSerializer (e2e)', () => {
  it('should exclude deletedAt and updatedAt and transform price', () => {
    const rawPrismaProduct = {
      id: 'abc-123',
      name: 'Hamburguesa',
      description: 'Doble carne',
      price: 1550n,
      stock: 10,
      categoryId: 'cat-1',
      restaurantId: 'rest-1',
      sku: 'HAM-01',
      imageUrl: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(), // Soft-deleted
    };

    const entity = new ProductSerializer(rawPrismaProduct);

    const serialized = instanceToPlain(entity);

    // Ensure @Exclude works
    expect(serialized.deletedAt).toBeUndefined();
    expect(serialized.updatedAt).toBeUndefined();

    // Ensure properties that shouldn't be excluded are present
    expect(serialized.id).toBe('abc-123');
    expect(serialized.name).toBe('Hamburguesa');
    expect(serialized.stock).toBe(10);
    
    // Ensure @Transform converts bigint to float mapped to original decimal
    expect(serialized.price).toBe(15.5);
  });
});
