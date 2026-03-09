### general requirements


- All modules should unit testing to cover at least 80% of the code
- All modules should have documentation inside apps/api-core/docs/modules. The documentation must indicate basic information about module, if need to be authenticated, roles, etc. All flow must documented using mermaid
- All has documentation correctly in swagger, swagger must show params, responses, etc.
- the controller must have the specific typing for the dto and responses.
- Must check if the action are under specify restaurante when user send requests.
- Check if the basic Role.BASIC only has permission to see data not to perform actions such as create, update, delete
- If a service is using  this.eventsGateway, move this logi to specify service related with the current module. For example if you are working on productos, the service could be called productEventGateway. All event must be const as const to avoid use string like that catalog:changed. The anothe alternative is move all events about diffentes module to eventsModule, to has centralize all events from diffentes module inside the current folder.

- avoid this patter repetitive to validate if the resource belongs to the restaurante. This function  await this.findMenuAndThrowIfNotFound(id, restaurantId); is called in all method, using another alternative like middleware.



  async updateMenu(
    id: string,
    restaurantId: string,
    data: Partial<CreateMenuData>,
  ): Promise<Menu> {
    await this.findMenuAndThrowIfNotFound(id, restaurantId);
    const menu = await this.menuRepository.update(id, data);
    this.eventsGateway?.emitToKiosk(restaurantId, 'catalog:changed', { type: 'menu', action: 'updated' });
    return menu;
  }

  async deleteMenu(id: string, restaurantId: string): Promise<Menu> {
    await this.findMenuAndThrowIfNotFound(id, restaurantId);
    const menu = await this.menuRepository.delete(id);
    this.eventsGateway?.emitToKiosk(restaurantId, 'catalog:changed', { type: 'menu', action: 'deleted' });
    return menu;
  }


INvalida controller
  @Get()
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ) {
    return this.categoriesService.findByRestaurantIdPaginated(
      user.restaurantId,
      query.page,
      query.limit,
    );
  }


Valid controller

  @Get()
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ): Promise<PaginatedCategoriesResponseDto> {
    return this.categoriesService.findByRestaurantIdPaginated(
      user.restaurantId,
      query.page,
      query.limit,
    );
  }



### module products


- The product controller in apps/api-core/src/products/categories.controller.ts must validate with interfaces the date that send to api gateway. Now the data is unknow. And why is the optional eventsGateway.

- Split this logis creating eventGatewayProducts inside put all logins to eventGateway, all events must be const as const to avoid write string like that 'catalog:changed'.

- check if all operations is correct under restaurante in category repository

  async update(
    id: string,
    restaurantId: string,
    data: Partial<CreateCategoryData>,
  ): Promise<Category> {
    return this.prisma.category.update({ where: { id, restaurantId }, data });
  }

  async delete(id: string, restaurantId: string): Promise<Category> {
    return this.prisma.category.delete({ where: { id, restaurantId } });
  }


- check the same verification why is optional at apps/api-core/src/products/products.service.ts?

 private readonly configService: ConfigType<typeof productConfig>,
    @Optional() private readonly eventsGateway?: EventsGateway,


- default category name must be a constant and be called from config.ts

Example code at apps/api-core/src/products/products.service.ts

  /**
   * Creates or retrieves the default category for a restaurant.
   * This is the single entry point for getting the default category.
   */
  async getOrCreateDefaultCategory(
    restaurantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Category> {
    return this.categoryRepository.findOrCreate({ name: 'default', restaurantId }, tx);
  }


- fix the patterst  this.eventsGateway?.emitToKiosk(restaurantId, 'catalog:changed', { type: 'product', action: 'created' }); to use the eventGatewayProduct

- this code must return custom errors. code, it throw ValidationException

async decrementStock(
    productId: string,
    restaurantId: string,
    amount: number,
  ): Promise<Product> {
    const product = await this.productRepository.findById(
      productId,
      restaurantId,
    );

    if (!product) throw new EntityNotFoundException('Product', productId);
    if (product.stock === null) return product; // infinite stock
    if (product.stock < amount) {
      throw new ValidationException(
        `Insufficient stock for product '${product.name}'. Available: ${product.stock}, requested: ${amount}`,
      );
    }
    return this.productRepository.update(productId, restaurantId, {
      stock: product.stock - amount,
    });
  }


### restaurante module

- The restaurante must has the option to change the name, and this action only perform by the admin. This action only the admin can do this

Method: POST
BODY: {name: string}
RESPONSE: new slug generated and status code 200

### module kiosk 

- avoid using string, use const as const. Code example error:

    // Group by section and add stock status
    const sections: Record<
      string,
      Array<{
        id: string;
        menuItemId: string;
        name: string;
        description: string | null;
        price: number;
        imageUrl: string | null;
        stockStatus: 'available' | 'low_stock' | 'out_of_stock';
        notes?: string;
      }>
    > = {};


- improve this funciton getMenuItems to be more redeable and split in diffentes functions


### module orders

- improve the funcion createOrder in orders.service and split in more function to be more readable
- use const insteaf of string. Exmaple code:


    if (newStatus === 'COMPLETED' && !order.isPaid) {
      throw new OrderNotPaidException(id);
    }

    const updated = await this.orderRepository.updateStatus(id, newStatus);
    this.eventsGateway?.emitToRestaurant(restaurantId, 'order:updated', { order: updated });
    return updated;
  }

  async cancelOrder(id: string, restaurantId: string, reason: string) {
    const order = await this.findById(id, restaurantId);

    if (order.status === 'CANCELLED') {
      throw new OrderAlreadyCancelledException(id);
    }

    if (order.status !== 'CREATED' && order.status !== 'PROCESSING') {
      throw new InvalidStatusTransitionException(order.status, 'CANCELLED');
    }

    const cancelled = await this.orderRepository.cancelOrder(id, reason);
    this.eventsGateway?.emitToRestaurant(restaurantId, 'order:updated', { order: cancelled });
    return cancelled;
  }