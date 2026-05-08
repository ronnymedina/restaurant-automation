import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';

import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { ProductsService } from '../products/products.service';
import { MenusService } from '../menus/menus.service';
import { MenuItemsService } from '../menus/menu-items.service';
import { GeminiService } from '../ai/gemini.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import {
  EmailAlreadyExistsException,
  RestaurantCreationFailedException,
  UserCreationFailedException,
  OnboardingFailedException,
} from './exceptions/onboarding.exceptions';

const mockRestaurant = {
  id: 'restaurant-uuid-1',
  name: 'Test Restaurant',
  slug: 'test-restaurant',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCategory = { id: 'category-uuid-1', name: 'default' };

const mockUser = {
  id: 'user-uuid-1',
  email: 'owner@restaurant.com',
  passwordHash: null,
  role: Role.MANAGER,
  isActive: false,
  activationToken: 'activation-token-uuid',
  restaurantId: 'restaurant-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMenu = { id: 'menu-uuid-1', name: 'Menú Principal', active: true, restaurantId: mockRestaurant.id };

const makeMockProduct = (n: number) => ({
  id: `product-uuid-${n}`,
  name: `Product ${n}`,
  price: 9.99,
  restaurantId: mockRestaurant.id,
  categoryId: mockCategory.id,
});

// PrismaService mock: $transaction executes the callback with a tx stub
const mockPrismaService = {
  $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
};

const mockRestaurantsService = {
  createRestaurant: jest.fn(),
};
const mockProductsService = {
  getOrCreateDefaultCategory: jest.fn(),
  createProduct: jest.fn(),
  createProductsBatch: jest.fn(),
};
const mockMenusService = { createMenu: jest.fn() };
const mockMenuItemsService = { bulkCreateItems: jest.fn() };
const mockGeminiService = { extractProductsFromMultipleImages: jest.fn() };
const mockUsersService = { findByEmail: jest.fn(), createOnboardingUser: jest.fn() };
const mockEmailService = { sendActivationEmail: jest.fn() };

describe('OnboardingService', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RestaurantsService, useValue: mockRestaurantsService },
        { provide: ProductsService, useValue: mockProductsService },
        { provide: MenusService, useValue: mockMenusService },
        { provide: MenuItemsService, useValue: mockMenuItemsService },
        { provide: GeminiService, useValue: mockGeminiService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    jest.clearAllMocks();

    // Default happy-path mocks
    mockUsersService.findByEmail.mockResolvedValue(null);
    mockUsersService.createOnboardingUser.mockResolvedValue(mockUser);
    mockRestaurantsService.createRestaurant.mockResolvedValue(mockRestaurant);
    mockProductsService.getOrCreateDefaultCategory.mockResolvedValue(mockCategory);
    mockEmailService.sendActivationEmail.mockResolvedValue(true);
  });

  // ─── Validation ──────────────────────────────────────────────────────────

  describe('email uniqueness', () => {
    it('rejects duplicate email before creating anything', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.registerRestaurant({ email: mockUser.email, restaurantName: 'Test Restaurant' }),
      ).rejects.toThrow(EmailAlreadyExistsException);

      expect(mockRestaurantsService.createRestaurant).not.toHaveBeenCalled();
      expect(mockUsersService.createOnboardingUser).not.toHaveBeenCalled();
    });
  });

  // ─── Creation failures ────────────────────────────────────────────────────

  describe('creation failures', () => {
    it('throws RestaurantCreationFailedException when restaurant creation fails', async () => {
      mockRestaurantsService.createRestaurant.mockRejectedValue(new Error('DB error'));

      await expect(
        service.registerRestaurant({ email: 'new@test.com', restaurantName: 'Test' }),
      ).rejects.toThrow(RestaurantCreationFailedException);

      expect(mockUsersService.createOnboardingUser).not.toHaveBeenCalled();
    });

    it('throws UserCreationFailedException when user creation fails', async () => {
      mockUsersService.createOnboardingUser.mockRejectedValue(new Error('DB error'));

      await expect(
        service.registerRestaurant({ email: 'new@test.com', restaurantName: 'Test' }),
      ).rejects.toThrow(UserCreationFailedException);
    });

    it('throws OnboardingFailedException when default category creation fails', async () => {
      mockProductsService.getOrCreateDefaultCategory.mockRejectedValue(new Error('DB error'));

      await expect(
        service.registerRestaurant({ email: 'new@test.com', restaurantName: 'Test' }),
      ).rejects.toThrow(OnboardingFailedException);
    });
  });

  // ─── Execution order ─────────────────────────────────────────────────────

  describe('execution order', () => {
    it('validates email → creates restaurant → creates user → sends email last', async () => {
      mockProductsService.createProduct.mockImplementation((_, p) =>
        Promise.resolve(makeMockProduct(1)),
      );
      mockMenusService.createMenu.mockResolvedValue(mockMenu);
      mockMenuItemsService.bulkCreateItems.mockResolvedValue(3);

      await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
        createDemoData: true,
      });

      const findEmailOrder = mockUsersService.findByEmail.mock.invocationCallOrder[0];
      const createRestOrder = mockRestaurantsService.createRestaurant.mock.invocationCallOrder[0];
      const createUserOrder = mockUsersService.createOnboardingUser.mock.invocationCallOrder[0];
      const sendEmailOrder = mockEmailService.sendActivationEmail.mock.invocationCallOrder[0];

      expect(findEmailOrder).toBeLessThan(createRestOrder);
      expect(createRestOrder).toBeLessThan(createUserOrder);
      expect(createUserOrder).toBeLessThan(sendEmailOrder);
    });

    it('sends activation email after all DB operations complete', async () => {
      await service.registerRestaurant({ email: 'new@test.com', restaurantName: 'Test' });

      expect(mockEmailService.sendActivationEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.activationToken,
      );
      // Should be called after user creation
      const createUserOrder = mockUsersService.createOnboardingUser.mock.invocationCallOrder[0];
      const sendEmailOrder = mockEmailService.sendActivationEmail.mock.invocationCallOrder[0];
      expect(createUserOrder).toBeLessThan(sendEmailOrder);
    });
  });

  // ─── Timezone ─────────────────────────────────────────────────────────────

  describe('timezone', () => {
    it('passes timezone from input to createRestaurant', async () => {
      await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
        timezone: 'America/Argentina/Buenos_Aires',
      });

      expect(mockRestaurantsService.createRestaurant).toHaveBeenCalledWith(
        'Test',
        'America/Argentina/Buenos_Aires',
        expect.anything(),
      );
    });

    it('uses UTC as default when timezone is not provided', async () => {
      await service.registerRestaurant({ email: 'new@test.com', restaurantName: 'Test' });

      expect(mockRestaurantsService.createRestaurant).toHaveBeenCalledWith(
        'Test',
        undefined,
        expect.anything(),
      );
    });
  });

  // ─── Email non-blocking ───────────────────────────────────────────────────

  describe('email non-blocking', () => {
    it('completes onboarding even when sendActivationEmail returns false', async () => {
      mockEmailService.sendActivationEmail.mockResolvedValue(false);

      const result = await service.registerRestaurant({ email: 'new@test.com', restaurantName: 'Test' });

      expect(result.productsCreated).toBe(0);
    });

    it('completes onboarding even when sendActivationEmail throws', async () => {
      mockEmailService.sendActivationEmail.mockRejectedValue(new Error('SMTP error'));

      const result = await service.registerRestaurant({ email: 'new@test.com', restaurantName: 'Test' });

      expect(result.productsCreated).toBe(0);
    });
  });

  // ─── createDemoData (demo) flow ─────────────────────────────────────────────

  describe('createDemoData = true (demo flow)', () => {
    beforeEach(() => {
      mockProductsService.createProduct.mockImplementation((_, p, __) =>
        Promise.resolve(makeMockProduct(Math.random())),
      );
      mockMenusService.createMenu.mockResolvedValue(mockMenu);
      mockMenuItemsService.bulkCreateItems.mockResolvedValue(3);
    });

    it('creates 5 demo products', async () => {
      const result = await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
        createDemoData: true,
      });

      expect(mockProductsService.createProduct).toHaveBeenCalledTimes(5);
      expect(result.productsCreated).toBe(5);
    });

    it('creates an active menu named Menú Principal', async () => {
      await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
        createDemoData: true,
      });

      expect(mockMenusService.createMenu).toHaveBeenCalledWith(
        mockRestaurant.id,
        expect.objectContaining({ name: 'Menú Principal', active: true }),
      );
    });

    it('creates two sections: Platos Principales (3 products) and Bebidas (2 products)', async () => {
      const products = [1, 2, 3, 4, 5].map(makeMockProduct);
      let callCount = 0;
      mockProductsService.createProduct.mockImplementation(() =>
        Promise.resolve(products[callCount++]),
      );

      await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
        createDemoData: true,
      });

      expect(mockMenuItemsService.bulkCreateItems).toHaveBeenCalledTimes(2);
      expect(mockMenuItemsService.bulkCreateItems).toHaveBeenCalledWith(
        mockMenu.id,
        [products[0].id, products[1].id, products[2].id],
        'Platos Principales',
      );
      expect(mockMenuItemsService.bulkCreateItems).toHaveBeenCalledWith(
        mockMenu.id,
        [products[3].id, products[4].id],
        'Bebidas',
      );
    });

    it('throws OnboardingFailedException when demo product creation fails', async () => {
      mockProductsService.createProduct.mockRejectedValue(new Error('DB error'));

      await expect(
        service.registerRestaurant({
          email: 'new@test.com',
          restaurantName: 'Test',
          createDemoData: true,
        }),
      ).rejects.toThrow(OnboardingFailedException);
    });
  });

  // ─── No photos, no createDemoData ───────────────────────────────────────────

  describe('no photos, createDemoData = false', () => {
    it('returns 0 products without calling createProduct or createMenu', async () => {
      const result = await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
      });

      expect(result.productsCreated).toBe(0);
      expect(mockProductsService.createProduct).not.toHaveBeenCalled();
      expect(mockMenusService.createMenu).not.toHaveBeenCalled();
    });
  });

  // ─── Photo extraction flow ────────────────────────────────────────────────

  describe('photo extraction', () => {
    const photo = { buffer: Buffer.from('img'), mimeType: 'image/jpeg' };

    it('creates products extracted from photo', async () => {
      mockGeminiService.extractProductsFromMultipleImages.mockResolvedValue([
        { name: 'Tacos', price: 7.5 },
        { name: 'Burrito', price: 9.0 },
      ]);
      mockProductsService.createProductsBatch.mockResolvedValue({ totalCreated: 2, batches: 1 });

      const result = await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
        photo,
      });

      expect(result.productsCreated).toBe(2);
      expect(mockProductsService.createProductsBatch).toHaveBeenCalled();
    });

    it('returns 0 products (non-blocking) when Gemini extraction fails', async () => {
      mockGeminiService.extractProductsFromMultipleImages.mockRejectedValue(new Error('API error'));

      const result = await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
        photo,
      });

      expect(result.productsCreated).toBe(0);
    });

    it('returns 0 products when Gemini returns empty array', async () => {
      mockGeminiService.extractProductsFromMultipleImages.mockResolvedValue([]);

      const result = await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
        photo,
      });

      expect(result.productsCreated).toBe(0);
      expect(mockProductsService.createProductsBatch).not.toHaveBeenCalled();
    });

    it('filters out extracted products with no valid price', async () => {
      mockGeminiService.extractProductsFromMultipleImages.mockResolvedValue([
        { name: 'Tacos', price: 7.5 },
        { name: 'Sin precio', price: undefined },
        { name: 'Gratis', price: 0 },
      ]);
      mockProductsService.createProductsBatch.mockResolvedValue({ totalCreated: 1, batches: 1 });

      await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
        photo,
      });

      const batchCall = mockProductsService.createProductsBatch.mock.calls[0] as unknown[][];
      const items = batchCall[2] as Array<{ name: string }>;
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Tacos');
    });

    it('caps extracted products at 20 when Gemini returns more', async () => {
      const manyProducts = Array.from({ length: 25 }, (_, i) => ({
        name: `Product ${i + 1}`,
        price: 10.0,
      }));
      mockGeminiService.extractProductsFromMultipleImages.mockResolvedValue(manyProducts);
      mockProductsService.createProductsBatch.mockResolvedValue({ totalCreated: 20, batches: 1 });

      await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
        photo: { buffer: Buffer.from('img'), mimeType: 'image/jpeg' },
      });

      const batchCall = mockProductsService.createProductsBatch.mock.calls[0] as unknown[][];
      const items = batchCall[2] as Array<{ name: string }>;
      expect(items).toHaveLength(20);
      expect(items[0].name).toBe('Product 1');
      expect(items[19].name).toBe('Product 20');
    });

    it('does not create demo products when photo extraction fails', async () => {
      mockGeminiService.extractProductsFromMultipleImages.mockRejectedValue(new Error('API error'));

      await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
        photo,
      });

      expect(mockMenusService.createMenu).not.toHaveBeenCalled();
      expect(mockProductsService.createProduct).not.toHaveBeenCalled();
    });
  });

  // ─── Response shape ───────────────────────────────────────────────────────

  describe('response', () => {
    it('returns only productsCreated field', async () => {
      const result = await service.registerRestaurant({
        email: 'new@test.com',
        restaurantName: 'Test',
      });

      expect(Object.keys(result)).toEqual(['productsCreated']);
    });
  });
});
