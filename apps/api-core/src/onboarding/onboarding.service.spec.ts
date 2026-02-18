import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';

import { OnboardingService } from './onboarding.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { ProductsService } from '../products/products.service';
import { GeminiService } from '../ai/gemini.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { EmailAlreadyExistsException } from './exceptions/onboarding.exceptions';

const mockRestaurant = {
  id: 'restaurant-uuid-1',
  name: 'Test Restaurant',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCategory = { id: 'category-uuid-1', name: 'General' };

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

const mockRestaurantsService = {
  createRestaurant: jest.fn().mockResolvedValue(mockRestaurant),
};

const mockProductsService = {
  getOrCreateDefaultCategory: jest.fn().mockResolvedValue(mockCategory),
  createDemoProducts: jest.fn().mockResolvedValue(3),
  createProductsBatch: jest.fn(),
};

const mockGeminiService = {
  extractProductsFromMultipleImages: jest.fn(),
};

const mockUsersService = {
  findByEmail: jest.fn(),
  createOnboardingUser: jest.fn().mockResolvedValue(mockUser),
};

const mockEmailService = {
  sendActivationEmail: jest.fn().mockResolvedValue(true),
};

describe('OnboardingService', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: RestaurantsService, useValue: mockRestaurantsService },
        { provide: ProductsService, useValue: mockProductsService },
        { provide: GeminiService, useValue: mockGeminiService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    jest.clearAllMocks();

    // Reset default happy-path mocks
    mockUsersService.findByEmail.mockResolvedValue(null);
    mockUsersService.createOnboardingUser.mockResolvedValue(mockUser);
    mockRestaurantsService.createRestaurant.mockResolvedValue(mockRestaurant);
    mockProductsService.getOrCreateDefaultCategory.mockResolvedValue(
      mockCategory,
    );
    mockProductsService.createDemoProducts.mockResolvedValue(3);
    mockEmailService.sendActivationEmail.mockResolvedValue(true);
  });

  describe('registerRestaurant - user creation flow', () => {
    it('should verify email uniqueness before creating anything', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.registerRestaurant({
          email: 'owner@restaurant.com',
          restaurantName: 'Test Restaurant',
          skipProducts: true,
        }),
      ).rejects.toThrow(EmailAlreadyExistsException);

      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(
        'owner@restaurant.com',
      );
      expect(mockRestaurantsService.createRestaurant).not.toHaveBeenCalled();
      expect(mockUsersService.createOnboardingUser).not.toHaveBeenCalled();
    });

    it('should create user linked to restaurant after restaurant creation', async () => {
      const result = await service.registerRestaurant({
        email: 'new@restaurant.com',
        restaurantName: 'Test Restaurant',
        skipProducts: true,
      });

      expect(mockRestaurantsService.createRestaurant).toHaveBeenCalledWith(
        'Test Restaurant',
      );
      expect(mockUsersService.createOnboardingUser).toHaveBeenCalledWith(
        'new@restaurant.com',
        mockRestaurant.id,
      );
      expect(result.restaurant).toEqual(mockRestaurant);
    });

    it('should send activation email and return emailSent=true on success', async () => {
      const result = await service.registerRestaurant({
        email: 'new@restaurant.com',
        restaurantName: 'Test Restaurant',
        skipProducts: true,
      });

      expect(mockEmailService.sendActivationEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.activationToken,
      );
      expect(result.emailSent).toBe(true);
    });

    it('should return emailSent=false when email fails without blocking onboarding', async () => {
      mockEmailService.sendActivationEmail.mockResolvedValue(false);

      const result = await service.registerRestaurant({
        email: 'new@restaurant.com',
        restaurantName: 'Test Restaurant',
        skipProducts: true,
      });

      expect(result.restaurant).toEqual(mockRestaurant);
      expect(result.productsCreated).toBe(3);
      expect(result.emailSent).toBe(false);
    });
  });

  describe('registerRestaurant - full onboarding flow with user', () => {
    it('should complete full flow: check email → create restaurant → create user → send email → create products', async () => {
      const result = await service.registerRestaurant({
        email: 'new@restaurant.com',
        restaurantName: 'Test Restaurant',
        skipProducts: true,
      });

      // Verify order: findByEmail → createRestaurant → createOnboardingUser → sendActivationEmail
      const findEmailOrder =
        mockUsersService.findByEmail.mock.invocationCallOrder[0];
      const createRestOrder =
        mockRestaurantsService.createRestaurant.mock.invocationCallOrder[0];
      const createUserOrder =
        mockUsersService.createOnboardingUser.mock.invocationCallOrder[0];

      expect(findEmailOrder).toBeLessThan(createRestOrder);
      expect(createRestOrder).toBeLessThan(createUserOrder);

      expect(result.productsCreated).toBe(3);
      expect(result.source).toBe('demo');
    });

    it('should return no products when skipProducts is false and no photos', async () => {
      const result = await service.registerRestaurant({
        email: 'new@restaurant.com',
        restaurantName: 'Test Restaurant',
      });

      expect(result.productsCreated).toBe(0);
      expect(result.source).toBe('none');
      expect(mockUsersService.createOnboardingUser).toHaveBeenCalled();
    });
  });
});
