import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from '../products.controller';
import { ProductsService } from '../products.service';
import { ProductQueryDto } from '../dto/product-query.dto';
import { ProductListSerializer } from '../serializers/product-list.serializer';

describe('ProductsController - listProducts', () => {
  let controller: ProductsController;
  let service: ProductsService;

  const mockProductsService = {
    listProductsWithPagination: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: mockProductsService,
        },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Validaciones de decoradores y guardias', () => {
    it('debe permitir el acceso únicamente a los roles ADMIN, MANAGER y BASIC', () => {
      // Validamos los roles a nivel de metadata (ya que los guards se prueban exhaustivamente en E2E)
      const roles = Reflect.getMetadata('roles', controller.listProducts);
      expect(roles).toEqual(['ADMIN', 'MANAGER', 'BASIC']); // Equivalente a Role.ADMIN, Role.MANAGER, Role.BASIC
    });
  });

  describe('Validaciones de Controller', () => {
    const user = { restaurantId: 'rest-aislado-123' };
    const query: ProductQueryDto = { page: 2, limit: 5 };

    const mockResult = {
      data: [{
        id: 'prod-1',
        name: 'Hamburguesa',
        price: 1500n,
        restaurantId: 'rest-aislado-123',
        category: { id: 'cat-1' }
      }],
      meta: { total: 10, page: 2, limit: 5, totalPages: 2 }
    };

    beforeEach(() => {
      mockProductsService.listProductsWithPagination.mockResolvedValue(mockResult);
    });

    it('debe aislar la data solicitando estrictamente el restaurantId del token del usuario', async () => {
      await controller.listProducts(user, query);
      // El controlador nunca usa IDs genéricos, siempre restringe al scope del tenant.
      expect(service.listProductsWithPagination).toHaveBeenCalledWith(
        'rest-aislado-123',
        expect.anything(),
        expect.anything(),
        undefined,
      );
    });

    it('debe delegar el control de la paginación y límites al servicio', async () => {
      await controller.listProducts(user, query);
      // El controlador envía los parámetros; los clampings de configuración máxima los hace el servicio.
      expect(service.listProductsWithPagination).toHaveBeenCalledWith(
        expect.anything(),
        2,
        5,
        undefined,
      );
    });

    it('debe pasar query.search al servicio cuando está presente', async () => {
      const queryWithSearch: ProductQueryDto = { page: 1, limit: 10, search: 'burger' };
      await controller.listProducts(user, queryWithSearch);

      expect(service.listProductsWithPagination).toHaveBeenCalledWith(
        'rest-aislado-123',
        1,
        10,
        'burger',
      );
    });

    it('debe pasar undefined al servicio cuando search no está presente', async () => {
      const queryWithoutSearch: ProductQueryDto = { page: 1, limit: 10 };
      await controller.listProducts(user, queryWithoutSearch);

      expect(service.listProductsWithPagination).toHaveBeenCalledWith(
        'rest-aislado-123',
        1,
        10,
        undefined,
      );
    });

    it('debe validar la estricta serialización de estructura con ProductListSerializer', async () => {
      const result = await controller.listProducts(user, query);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(ProductListSerializer);
      expect(result.meta).toEqual(mockResult.meta);
    });
  });
});
